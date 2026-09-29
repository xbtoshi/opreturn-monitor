/**
 * Full-chain OP_RETURN ingestion.
 *
 * Each cron run (when INGEST_FORWARD=1) walks the forward cursor towards the
 * chain tip, one raw block at a time: download, parse in memory, decode every
 * OP_RETURN output, store the txs whose primary protocol is storable, count
 * the rest (Runes, opaque binary) on the block row. Once caught up, and when
 * INGEST_BACKFILL=1, spare budget walks a second cursor backwards to a floor.
 *
 * Everything is idempotent (INSERT OR IGNORE + recomputable dedupe), so a
 * run cut short by the Worker limit simply resumes next time.
 */
import { scriptToAddress } from './address';
import { parseRawBlock, txidOf } from './blocks';
import * as db from './db';
import { fetchBlockHashAt, fetchBlockHeader, fetchRawBlock, fetchTipHeight } from './mempool';
import { decodeTx, isStorableProtocol } from './protocols';
import type { Env } from './types';

const BATCH_SIZE = 60;
/** How far back a reorg can reach before we give up and alert via status. */
const MAX_REORG_DEPTH = 12;

function flag(v: string | undefined): boolean {
  return v === '1' || v === 'true';
}

function intVar(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export interface IngestConfig {
  forward: boolean;
  backfill: boolean;
  maxBlocks: number;
  budgetMs: number;
  backfillDays: number;
}

export function ingestConfig(env: Env): IngestConfig {
  return {
    forward: flag(env.INGEST_FORWARD),
    backfill: flag(env.INGEST_BACKFILL),
    maxBlocks: intVar(env.INGEST_MAX_BLOCKS_PER_RUN, 3),
    budgetMs: intVar(env.INGEST_TIME_BUDGET_MS, 60000),
    backfillDays: intVar(env.BACKFILL_DAYS, 30),
  };
}

export interface IngestStatus {
  config: IngestConfig;
  tip: number | null;
  next_height: number | null;
  backfill_height: number | null;
  backfill_floor: number | null;
  last_error: string | null;
  /** Set when forward ingestion stopped itself (deep reorg); clear via ingest/reset. */
  halt_reason: string | null;
  /** Last time the AI classifier wrote at least one category. */
  ai_last_ok: string | null;
  ai_last_error: string | null;
  ai_last_error_at: string | null;
  /** IndexNow push bookkeeping (see src/indexnow.ts). */
  indexnow_bootstrap_id: number | null;
  indexnow_last_ok: string | null;
  indexnow_last_error: string | null;
  indexnow_last_error_at: string | null;
  /** URL count of the last batch the hub accepted in full. */
  indexnow_last_batch_urls: number | null;
  stats: db.ChainStats;
  recent: db.BlockRow[];
}

export async function ingestStatus(env: Env, hosts: string[]): Promise<IngestStatus> {
  const [state, stats, recent, tip] = await Promise.all([
    db.getIngestState(env.DB),
    db.getChainStats(env.DB),
    db.listRecentBlocks(env.DB, 10),
    fetchTipHeight(hosts).catch(() => null),
  ]);
  const n = (k: string) => (state[k] == null ? null : Number(state[k]));
  return {
    config: ingestConfig(env),
    tip,
    next_height: n('next_height'),
    backfill_height: n('backfill_height'),
    backfill_floor: n('backfill_floor'),
    last_error: state.last_error || null,
    halt_reason: state.halt_reason || null,
    ai_last_ok: state.ai_last_ok || null,
    ai_last_error: state.ai_last_error || null,
    ai_last_error_at: state.ai_last_error_at || null,
    indexnow_bootstrap_id: n('indexnow_bootstrap_id'),
    indexnow_last_ok: state.indexnow_last_ok || null,
    indexnow_last_error: state.indexnow_last_error || null,
    indexnow_last_error_at: state.indexnow_last_error_at || null,
    indexnow_last_batch_urls: n('indexnow_last_batch_urls'),
    stats,
    recent,
  };
}

/** Point the cursors at `height` (forward) and start the backfill just below it. */
export async function resetIngestCursors(env: Env, height: number, floor?: number): Promise<void> {
  const cfg = ingestConfig(env);
  await db.setIngestState(env.DB, {
    next_height: height,
    backfill_height: height - 1,
    backfill_floor: floor ?? Math.max(0, height - 144 * cfg.backfillDays),
    last_error: '',
    halt_reason: '',
  });
}

/**
 * Entry point called by the cron. Returns the number of blocks ingested.
 * `startedMs` is when the cron run began; the time budget counts from there.
 */
export async function ingestBlocks(env: Env, hosts: string[], startedMs: number): Promise<number> {
  const cfg = ingestConfig(env);
  if (!cfg.forward && !cfg.backfill) return 0;

  const tip = await fetchTipHeight(hosts);
  if (tip == null) return 0;

  let state = await db.getIngestState(env.DB);
  if (!state.next_height) {
    await resetIngestCursors(env, tip);
    state = await db.getIngestState(env.DB);
  }
  let next = Number(state.next_height);
  let backfill = Number(state.backfill_height);
  const floor = Number(state.backfill_floor ?? 0);

  const withinBudget = () => Date.now() - startedMs < cfg.budgetMs;
  let done = 0;

  try {
    if (cfg.forward && !state.halt_reason) {
      const fork = await detectReorg(env, hosts, next);
      if (fork != null) {
        const groups = await db.rollbackFrom(env.DB, fork);
        await db.recomputeGroups(env.DB, groups);
        next = fork;
        await db.setIngestState(env.DB, { next_height: next, last_error: `reorg: rolled back to ${fork}` });
      }
      while (next <= tip && done < cfg.maxBlocks && withinBudget()) {
        await ingestOne(env, hosts, next, { next_height: next + 1 });
        next++;
        done++;
      }
    }

    if (cfg.backfill && next > tip) {
      while (backfill >= floor && backfill > 0 && done < cfg.maxBlocks && withinBudget()) {
        await ingestOne(env, hosts, backfill, { backfill_height: backfill - 1 });
        backfill--;
        done++;
      }
    }
    if (done > 0) await db.setIngestState(env.DB, { last_error: '' });
  } catch (e) {
    const msg = String(e).slice(0, 300);
    const updates: Record<string, string> = { last_error: msg };
    // A reorg deeper than we track needs an operator (ingest/reset); stop
    // retrying every run instead of re-throwing forever.
    if (e instanceof DeepReorgError) updates.halt_reason = msg;
    await db.setIngestState(env.DB, updates).catch(() => {});
  }
  return done;
}

class DeepReorgError extends Error {}

/**
 * Compare the highest scanned block with the chain. A reorg of depth N
 * changes the hashes of the top N blocks, so checking the top one catches
 * every reorg; we then walk down to find where the chains agree.
 * Returns the first height that must be re-scanned, or null.
 */
async function detectReorg(env: Env, hosts: string[], nextHeight: number): Promise<number | null> {
  let stored = await db.getHighestBlockBelow(env.DB, nextHeight);
  if (!stored) return null;
  let depth = 0;
  while (stored && depth < MAX_REORG_DEPTH) {
    const chainHash = await fetchBlockHashAt(hosts, stored.height);
    if (!chainHash) return null; // can't tell; try again next run
    if (chainHash === stored.hash) return depth === 0 ? null : stored.height + 1;
    depth++;
    stored = await db.getHighestBlockBelow(env.DB, stored.height);
  }
  throw new DeepReorgError(`reorg deeper than ${MAX_REORG_DEPTH} blocks below ${nextHeight}; reset cursors via /api/admin/ingest/reset`);
}

interface Census {
  opreturn: number;
  runes: number;
  binary: number;
  stored: number;
}

/** Download, parse and store one block, then advance the given cursor. */
export async function ingestOne(
  env: Env,
  hosts: string[],
  height: number,
  cursorUpdate: Record<string, string | number>
): Promise<Census> {
  const hash = await fetchBlockHashAt(hosts, height);
  if (!hash) throw new Error(`no hash for height ${height}`);
  const header = await fetchBlockHeader(hosts, hash);
  if (!header) throw new Error(`no header for ${hash}`);

  // Forward mode: the header's parent must be the block we already stored,
  // else a reorg slipped in between the check and now.
  const parent = await db.getBlock(env.DB, height - 1);
  if (parent && header.previousblockhash && parent.hash !== header.previousblockhash) {
    throw new Error(`parent mismatch at ${height}: stored ${parent.hash.slice(0, 12)} vs chain ${header.previousblockhash.slice(0, 12)}`);
  }

  const raw = await fetchRawBlock(hosts, hash);
  if (!raw) throw new Error(`no raw block for ${hash}`);
  const block = parseRawBlock(raw);
  if (block.txCount !== header.tx_count) throw new Error(`tx count mismatch at ${height}`);

  const monitored = new Set((await db.listAddresses(env.DB)).map((a) => a.address));
  const census: Census = { opreturn: 0, runes: 0, binary: 0, stored: 0 };
  const rows: db.NewMessage[] = [];
  const txids: string[] = [];

  for (const tx of block.txs) {
    const decoded = decodeTx(tx.outputs.map((o) => ({ scriptpubkey: o.script, value: o.value })));
    census.opreturn += decoded.ops.length;
    for (const op of decoded.ops) {
      if (op.protocol === 'runes') census.runes++;
      else if (op.protocol === 'binary' || op.protocol === 'witness-commitment') census.binary++;
    }
    if (!isStorableProtocol(decoded.protocol)) continue;

    // Addresses are derived only for stored txs (~2% of the block).
    let recipient: string | null = null;
    let monitoredAddress: string | null = null;
    for (const o of tx.outputs) {
      if (o.script[0] === 0x6a) continue;
      const addr = scriptToAddress(o.script);
      if (!addr) continue;
      if (recipient == null) recipient = addr;
      if (monitoredAddress == null && monitored.has(addr)) monitoredAddress = addr;
    }
    const txid = txidOf(raw, tx);
    txids.push(txid);
    rows.push({
      txid,
      address: monitoredAddress ?? recipient ?? '',
      content: decoded.content,
      raw_hex: null,
      is_mempool: false,
      fee_sats: null,
      fee_rate: null,
      block_time: header.timestamp,
      block_height: height,
      sender: null,
      protocol: decoded.protocol,
      recipient,
      monitored_address: monitoredAddress,
      content_hash: db.contentHash(decoded.content, decoded.ops[0]?.payload_hex),
      ops: decoded.ops,
    });
  }
  census.stored = rows.length;

  // Writes: rows + ops in chunks, then confirmations, then the block row and
  // cursor together in the final batch. Every statement is idempotent.
  const stmts: D1PreparedStatement[] = [];
  for (const row of rows) stmts.push(...db.insertMessageStatements(env.DB, row));
  stmts.push(...db.confirmTxidsStatements(env.DB, txids, header.timestamp, height));
  for (let i = 0; i < stmts.length; i += BATCH_SIZE) await env.DB.batch(stmts.slice(i, i + BATCH_SIZE));

  // Settle dedupe (only groups that actually have company) BEFORE the cursor
  // moves: if this step dies, the block is simply re-scanned next run.
  const multi = await db.findMultiGroups(
    env.DB,
    rows.map((r) => r.content_hash)
  );
  await db.recomputeGroups(env.DB, multi);

  const final: D1PreparedStatement[] = [
    db.upsertBlockStatement(env.DB, {
      height,
      hash,
      time: header.timestamp,
      tx_count: header.tx_count,
      opreturn_count: census.opreturn,
      runes_count: census.runes,
      binary_count: census.binary,
      stored_count: census.stored,
    }),
  ];
  for (const [k, v] of Object.entries(cursorUpdate)) final.push(db.setIngestStateStatement(env.DB, k, v));
  await env.DB.batch(final);
  return census;
}
