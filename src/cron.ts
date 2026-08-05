import { classifyMessage } from './classify';
import * as db from './db';
import { extractOpReturnText, fetchAddressTxs, resolveMempoolBase } from './mempool';
import { ensureSeeded } from './seed';
import type { Env, RunSummary } from './types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function intEnv(env: Env, key: 'AI_MAX_PER_RUN' | 'AI_DELAY_MS', fallback: number): number {
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

  const baseUrl = await resolveMempoolBase(env.MEMPOOL_BASE_URL || 'https://mempool.space');
  const aiMax = intEnv(env, 'AI_MAX_PER_RUN', 50);
  const aiDelay = intEnv(env, 'AI_DELAY_MS', 200);

  let scannedTxs = 0;
  let inserted = 0;
  let skipped = 0;
  let failedFetches = 0;

  const addresses = await db.listAddresses(env.DB);

  for (const addr of addresses) {
    const { txs, ok } = await fetchAddressTxs(baseUrl, addr.address);
    if (!ok) failedFetches++;
    scannedTxs += txs.length;

    const seenTxids = new Set<string>();
    for (const tx of txs) {
      if (seenTxids.has(tx.txid)) continue;
      seenTxids.add(tx.txid);

      const content = extractOpReturnText(tx);
      if (!content) {
        skipped++;
        continue;
      }

      const isNew = await db.insertMessage(env.DB, {
        txid: tx.txid,
        address: addr.address,
        content,
        raw_hex: tx.hex ?? null,
        is_mempool: Boolean(tx.status && tx.status.confirmed === false),
      });
      if (isNew) inserted++;
      else skipped++;
    }

    // Be gentle with mempool.space public API rate limits.
    await sleep(150);
  }

  const classified = await classifyNewMessages(env.DB, env, aiMax, aiDelay);

  return {
    scanned_txs: scannedTxs,
    inserted,
    classified,
    failed_fetches: failedFetches,
    skipped,
    took_ms: Date.now() - started,
  };
}

async function classifyNewMessages(
  d1: D1Database,
  env: Env,
  max: number,
  delayMs: number
): Promise<number> {
  const pending = await db.getUnclassifiedMessages(d1, max);
  let classified = 0;

  for (const msg of pending) {
    if (!msg.content) continue;
    const category = await classifyMessage(msg.content, env);
    if (category) {
      await db.setCategory(d1, msg.id, category);
      classified++;
    }
    await sleep(delayMs);
  }

  return classified;
}
