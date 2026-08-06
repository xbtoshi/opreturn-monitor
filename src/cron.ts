import { classifyBatch } from './classify';
import * as db from './db';
import {
  blockTimeFromTx,
  extractOpReturnText,
  feeFromTx,
  fetchAddressTxs,
  resolveMempoolBase,
} from './mempool';
import { ensureSeeded } from './seed';
import type { Env, RunSummary } from './types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function intEnv(env: Env, key: 'AI_MAX_PER_RUN', fallback: number): number {
  const v = Number(env[key]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/**
 * Main cron pipeline:
 *  1. ensure seed collections exist
 *  2. fetch recent confirmed + mempool txs for every monitored address
 *  3. extract OP_RETURN messages, insert new ones (dedup by txid)
 *  4. classify newly-unclassified messages via the OpenAI-compatible API
 */
export async function runCron(env: Env): Promise<RunSummary> {
  const started = Date.now();
  await ensureSeeded(env.DB);
  // One-time-ish repair: rows that confirmed before the cron learned to flip
  // is_mempool stay flagged pending forever; sweep them on every run (cheap).
  await db.repairConfirmedFlags(env.DB);

  const baseUrl = await resolveMempoolBase(env.MEMPOOL_BASE_URL || 'https://mempool.space');
  const aiMax = intEnv(env, 'AI_MAX_PER_RUN', 50);

  let scannedTxs = 0;
  let inserted = 0;
  let skipped = 0;
  let failedFetches = 0;

  const addresses = await db.listAddresses(env.DB);

  for (const addr of addresses) {
    const { txs, ok, complete } = await fetchAddressTxs(baseUrl, addr.address);
    if (!ok) failedFetches++;
    scannedTxs += txs.length;

    const seenTxids = new Set<string>();
    const liveMempoolTxids: string[] = [];
    for (const tx of txs) {
      if (seenTxids.has(tx.txid)) continue;
      seenTxids.add(tx.txid);

      const isMempool = Boolean(tx.status && tx.status.confirmed === false);
      if (isMempool) liveMempoolTxids.push(tx.txid);

      const content = extractOpReturnText(tx);
      if (!content) {
        skipped++;
        continue;
      }

      const { feeSats, feeRate } = feeFromTx(tx);
      const blockTime = blockTimeFromTx(tx);
      const isNew = await db.insertMessage(env.DB, {
        txid: tx.txid,
        address: addr.address,
        content,
        raw_hex: tx.hex ?? null,
        is_mempool: isMempool,
        fee_sats: feeSats,
        fee_rate: feeRate,
        block_time: blockTime,
      });
      if (isNew) inserted++;
      else {
        skipped++;
        if (feeSats != null) await db.backfillFees(env.DB, tx.txid, feeSats, feeRate);
        if (blockTime != null) await db.backfillBlockTime(env.DB, tx.txid, blockTime);
        if (!isMempool) await db.confirmMessage(env.DB, tx.txid, blockTime);
      }
    }

    // Drop unconfirmed rows that vanished from the mempool (RBF/eviction),
    // but only when this poll got a trustworthy mempool snapshot.
    if (complete) await db.deleteStaleMempool(env.DB, addr.address, liveMempoolTxids);

    // Be gentle with mempool.space public API rate limits.
    await sleep(150);
  }

  const classified = await classifyNewMessages(env.DB, env, aiMax);

  return {
    scanned_txs: scannedTxs,
    inserted,
    classified,
    failed_fetches: failedFetches,
    skipped,
    took_ms: Date.now() - started,
  };
}

async function classifyNewMessages(d1: D1Database, env: Env, max: number): Promise<number> {
  const pending = await db.getUnclassifiedMessages(d1, max);
  if (pending.length === 0) return 0;

  const results = await classifyBatch(
    pending.map((m) => ({ id: m.id, content: m.content as string })),
    env
  );

  let classified = 0;
  for (const [id, category] of Object.entries(results)) {
    await db.setCategory(d1, Number(id), category);
    classified++;
  }

  return classified;
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
