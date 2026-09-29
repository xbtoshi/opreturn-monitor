import { classifyBatch } from './classify';
import * as db from './db';
import { ingestBlocks } from './ingest';
import {
  blockHeightFromTx,
  blockTimeFromTx,
  feeFromTx,
  fetchAddressTxs,
  fetchTxById,
  mempoolHosts,
  resolveMempoolBase,
  senderFromTx,
} from './mempool';
import { decodeTx, isStorableProtocol, reparseContent } from './protocols';
import { ensureSeeded } from './seed';
import type { Env, RunSummary } from './types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Legacy rows (protocol IS NULL) re-parsed from stored text per run. */
const REPARSE_PER_RUN = 500;
/** Rows whose sender/fee/recipient we fetch by txid per run. */
const DETAIL_PER_RUN = 40;
const DETAIL_CONCURRENCY = 4;
/** Monitored addresses fetched in parallel per poll step. */
const POLL_CONCURRENCY = 3;

function intEnv(env: Env, key: 'AI_MAX_PER_RUN', fallback: number): number {
  const v = Number(env[key]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/**
 * Main cron pipeline:
 *  1. ensure seed collections exist
 *  2. full-chain block ingestion (when enabled) — every OP_RETURN in new blocks
 *  3. poll recent confirmed + mempool txs for every monitored address
 *  4. re-parse legacy rows, attribute rows to monitored addresses, fill details
 *  5. classify newly-unclassified human messages via the OpenAI-compatible API
 */
export async function runCron(env: Env): Promise<RunSummary> {
  const started = Date.now();
  await ensureSeeded(env.DB);
  // One-time-ish repair: rows that confirmed before the cron learned to flip
  // is_mempool stay flagged pending forever; sweep them on every run (cheap).
  await db.repairConfirmedFlags(env.DB);

  const hosts = mempoolHosts(env);
  await resolveMempoolBase(hosts);
  const aiMax = intEnv(env, 'AI_MAX_PER_RUN', 50);

  const phase: Record<string, number> = {};
  let mark = Date.now();
  const lap = (name: string) => {
    phase[name] = Date.now() - mark;
    mark = Date.now();
  };

  const blocksIngested = await ingestBlocks(env, hosts, started).catch(() => 0);
  lap('ingest');

  let scannedTxs = 0;
  let inserted = 0;
  let skipped = 0;
  let failedFetches = 0;

  const addresses = await db.listAddresses(env.DB);

  // Fetch a few addresses at a time (the network wait dominates), then write
  // each address's rows sequentially so D1 sees a steady stream.
  for (let i = 0; i < addresses.length; i += POLL_CONCURRENCY) {
    const group = addresses.slice(i, i + POLL_CONCURRENCY);
    const fetched = await Promise.all(group.map((a) => fetchAddressTxs(hosts, a.address)));
    for (let k = 0; k < group.length; k++) {
    const addr = group[k];
    const { txs, ok, complete } = fetched[k];
    if (!ok) failedFetches++;
    scannedTxs += txs.length;

    const seenTxids = new Set<string>();
    const liveMempoolTxids: string[] = [];
    for (const tx of txs) {
      if (seenTxids.has(tx.txid)) continue;
      seenTxids.add(tx.txid);

      const isMempool = Boolean(tx.status && tx.status.confirmed === false);
      if (isMempool) liveMempoolTxids.push(tx.txid);

      const decoded = decodeTx((tx.vout ?? []).map((o) => ({ ...o, scriptpubkey: o.scriptpubkey ?? '' })));
      if (decoded.ops.length === 0 || !isStorableProtocol(decoded.protocol)) {
        skipped++;
        continue;
      }

      const { feeSats, feeRate } = feeFromTx(tx);
      const blockTime = blockTimeFromTx(tx);
      const isNew = await db.insertMessage(env.DB, {
        txid: tx.txid,
        address: addr.address,
        content: decoded.content,
        raw_hex: tx.hex ?? null,
        is_mempool: isMempool,
        fee_sats: feeSats,
        fee_rate: feeRate,
        block_time: blockTime,
        block_height: blockHeightFromTx(tx),
        sender: senderFromTx(tx),
        protocol: decoded.protocol,
        recipient: decoded.recipient,
        monitored_address: addr.address,
        content_hash: db.contentHash(decoded.content, decoded.ops[0]?.payload_hex),
        ops: decoded.ops,
      });
      if (isNew) inserted++;
      else skipped++;
    }

    // Drop unconfirmed rows that vanished from the mempool (RBF/eviction),
    // but only when this poll got a trustworthy mempool snapshot.
    if (complete) await db.deleteStaleMempool(env.DB, addr.address, liveMempoolTxids);
    }

    // Be gentle with public API rate limits.
    await sleep(150);
  }

  lap('poll');
  const reparsed = await reparseLegacy(env.DB, REPARSE_PER_RUN);
  lap('reparse');
  await db.reconcileMonitored(env.DB);
  lap('reconcile');
  const detailsFilled = await backfillDetails(env.DB, hosts, DETAIL_PER_RUN);
  lap('details');
  const classified = await classifyNewMessages(env.DB, env, aiMax);
  lap('classify');

  return {
    scanned_txs: scannedTxs,
    inserted,
    classified,
    failed_fetches: failedFetches,
    skipped,
    reparsed,
    details_filled: detailsFilled,
    blocks_ingested: blocksIngested,
    took_ms: Date.now() - started,
    phase_ms: phase,
  };
}

/**
 * Rows stored before the protocol registry existed have protocol NULL. Their
 * content is the decoded text of every OP_RETURN output joined by newline,
 * which is enough to recover JSON token ops and memos. Runs until the
 * backlog is gone (one page per cron run), no manual step needed.
 */
export async function reparseLegacy(d1: D1Database, limit: number): Promise<number> {
  const rows = await db.listMessagesNeedingReparse(d1, limit);
  const groups: db.GroupKey[] = [];
  for (const row of rows) {
    const content = row.content ?? '';
    const { ops, protocol } = content.trim() ? reparseContent(content) : { ops: [], protocol: 'binary' };
    const hash = db.contentHash(content, null);
    await db.applyReparse(d1, row, protocol, hash, ops);
    groups.push({ address: row.address, content_hash: hash });
  }
  await db.recomputeGroups(d1, groups);
  return rows.length;
}

/**
 * Sender, fee and recipient live only in the tx-detail payload. Block
 * ingestion deliberately skips that call (80 requests per block would swamp
 * the run), so fill them lazily here, a few rows per run, text rows first.
 */
export async function backfillDetails(d1: D1Database, hosts: string[], limit: number): Promise<number> {
  const rows = await db.listMessagesNeedingDetail(d1, limit);
  let filled = 0;
  // A few requests in flight at once keeps this well under the public API's
  // tolerance while not serialising 40 round trips.
  for (let i = 0; i < rows.length; i += DETAIL_CONCURRENCY) {
    const group = rows.slice(i, i + DETAIL_CONCURRENCY);
    const txs = await Promise.all(group.map((row) => fetchTxById(hosts, row.txid)));
    for (let k = 0; k < group.length; k++) {
      const row = group[k];
      const tx = txs[k];
      if (tx) {
        const decoded = decodeTx((tx.vout ?? []).map((o) => ({ ...o, scriptpubkey: o.scriptpubkey ?? '' })));
        const { feeSats, feeRate } = feeFromTx(tx);
        await db.applyDetail(d1, row.txid, {
          sender: senderFromTx(tx),
          recipient: decoded.recipient,
          fee_sats: feeSats,
          fee_rate: feeRate,
          block_time: blockTimeFromTx(tx),
          block_height: blockHeightFromTx(tx),
        });
        filled++;
      } else {
        await db.bumpDetailTries(d1, row.txid);
      }
    }
    await sleep(150);
  }
  // Sender is part of the "never collapse a monitored party" rule, so settle
  // the groups these rows belong to now that it is known.
  if (rows.length) {
    await db.recomputeGroups(
      d1,
      rows.filter((r) => r.content_hash).map((r) => ({ address: r.address, content_hash: r.content_hash as string }))
    );
  }
  return filled;
}

async function classifyNewMessages(d1: D1Database, env: Env, max: number): Promise<number> {
  const pending = await db.getUnclassifiedMessages(d1, max);
  if (pending.length === 0) return 0;

  const result = await classifyBatch(
    pending.map((m) => ({ id: m.id, content: m.content as string })),
    env
  );

  const assignments = Object.entries(result.categories).map(([id, category]) => ({ id: Number(id), category }));
  if (assignments.length) await db.setCategories(d1, assignments);

  // Leave a trace either way: the classifier was silently dead for three
  // weeks once because every failure collapsed into "0 classified".
  const now = new Date().toISOString();
  if (result.error) {
    console.error('classify:', result.error);
    await db.setIngestState(d1, { ai_last_error: result.error.slice(0, 300), ai_last_error_at: now });
  }
  if (assignments.length) await db.setIngestState(d1, { ai_last_ok: now });

  return assignments.length;
}

/**
 * Re-run the protocol detectors over rows filed as text (or never parsed),
 * `limit` at a time from `after`. Used after new residue detectors ship so old rows
 * leave the human feed too. Returns the last id looked at (null when done).
 */
export async function reparseTextRows(
  d1: D1Database,
  after: number,
  limit: number
): Promise<{ scanned: number; changed: number; next_after: number | null }> {
  const rows = await db.listTextRowsForReparse(d1, after, limit);
  const groups: db.GroupKey[] = [];
  let changed = 0;
  for (const row of rows) {
    const content = row.content ?? '';
    const { ops, protocol } = content.trim() ? reparseContent(content) : { ops: [], protocol: 'binary' };
    // Text rows that still read as text are untouched; never-parsed rows
    // always get written so they stop counting as text by default.
    if (protocol === 'text' && row.protocol === 'text') continue;
    const hash = db.contentHash(content, null);
    await db.applyReparse(d1, row, protocol, hash, ops, row.protocol != null);
    groups.push({ address: row.address, content_hash: hash });
    changed++;
  }
  await db.recomputeGroups(d1, groups);
  return { scanned: rows.length, changed, next_after: rows.length < limit ? null : rows[rows.length - 1].id };
}

/** Classify every unclassified message, in batches, until none remain. */
export async function classifyAll(env: Env): Promise<number> {
  let total = 0;
  for (;;) {
    const n = await classifyNewMessages(env.DB, env, 200);
    if (n === 0) break;
    total += n;
  }
  return total;
}

/** Classify at most `max` unclassified messages (single pass, for admin
 *  endpoint so a request finishes within Worker wall-clock limits). */
export async function classifyOnePass(env: Env, max: number): Promise<number> {
  return classifyNewMessages(env.DB, env, max);
}
