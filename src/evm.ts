/**
 * The archive's one Ethereum board: text people send as transaction input
 * data to the wallets that drained Binance on 29 October 2026.
 *
 * Scope is deliberately narrow (user-approved): a few watched addresses in
 * collections.json, read from a public Blockscout instance (no key). Rows
 * reuse the messages table; chain is derived from format (0x + 64 hex tx
 * hash, 0x + 40 hex address), an Ethereum-only decision. Every 0x value is
 * stored lowercase.
 *
 * Verification snapshot (2026-10-30, newest ≤300 txs per wallet on
 * eth.blockscout.com): of 17 Etherscan "Binance Hot Wallet Exploiter" labels,
 * people write to four; the others only receive one sender's identical text
 * every ~15 minutes. Those four are the watched set.
 *
 * Kill switch: set EVM_POLL = "0" (wrangler var or dashboard) to stop polling.
 * Rollback: remove the collection from collections.json (seeding never
 * deletes), then run against D1:
 *   DELETE FROM votes WHERE message_id IN (SELECT id FROM messages WHERE txid LIKE '0x%');
 *   DELETE FROM ops WHERE txid LIKE '0x%';
 *   DELETE FROM messages WHERE txid LIKE '0x%';
 *   DELETE FROM addresses WHERE address LIKE '0x%';
 *   DELETE FROM collections WHERE slug = 'binance-hack-ethereum-bulletin-board';
 *   DELETE FROM ingest_state WHERE key LIKE 'evm_backfill:%';
 *   DELETE FROM agg_cache;
 * Removed /m pages then 404; the monthly message sitemaps drop them on their
 * next rebuild. Nothing is pushed to IndexNow for deletions.
 */
import * as db from './db';
import type { Env } from './types';

export const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
export const EVM_TX = /^0x[0-9a-fA-F]{64}$/;
const MAX_INPUT_BYTES = 8192;
/** Older pages walked per address per run until the history is in. */
const BACKFILL_PAGES_PER_RUN = 3;
/** Blockscout pages for busy wallets take ~8 s cold; four run in parallel. */
const FETCH_TIMEOUT_MS = 30000;
/** No new backfill page starts after this much of the run; the newest page is always fetched. */
const BACKFILL_BUDGET_MS = 60000;

export function isEvmAddress(a: string | null | undefined): boolean {
  return EVM_ADDRESS.test(String(a ?? ''));
}

/** Lowercase an Ethereum address; any other string is returned as is. */
export function normAddress(a: string): string {
  return isEvmAddress(a) ? a.toLowerCase() : a;
}

/**
 * Readable text in a transaction's input data, or null.
 *
 * Hex → bytes (≤ 8 KB) → strict UTF-8 → trim NULs and whitespace at the ends
 * → no NUL may remain → at least 2 code points → at least 90% of code points
 * printable. Control, format, private-use and unassigned characters count as
 * unprintable, except newline, carriage return, tab, the zero-width (non-)joiner,
 * variation selectors (emoji sequences) and bidi marks (Arabic, Hebrew). ABI calldata fails the UTF-8 decode or
 * the ratio (zero-padded 32-byte words).
 */
export function evmText(rawInput: string | null | undefined): string | null {
  const hex = String(rawInput ?? '').replace(/^0x/i, '');
  if (!hex || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) return null;
  if (hex.length / 2 > MAX_INPUT_BYTES) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return null;
  }
  text = text.replace(/^[\u0000\s]+|[\u0000\s]+$/g, '');
  if (text.includes('\u0000')) return null;
  const points = Array.from(text);
  if (points.length < 2) return null;
  const unprintable = points.filter((ch) => /[\p{Cc}\p{Cf}\p{Co}\p{Cn}]/u.test(ch) && !/[\n\r\t\u200c\u200d\u200e\u200f\u202a-\u202e\u2066-\u2069\ufe0e\ufe0f]/.test(ch)).length;
  return (points.length - unprintable) / points.length >= 0.9 ? text : null;
}

/** The fields we read from a Blockscout v2 transaction. */
export interface BlockscoutTx {
  hash: string;
  from?: { hash?: string | null } | null;
  to?: { hash?: string | null } | null;
  raw_input?: string | null;
  timestamp?: string | null;
  status?: string | null;
  result?: string | null;
}

export interface BlockscoutPage {
  items: BlockscoutTx[];
  next_page_params: Record<string, unknown> | null;
}

/** One confirmed, successful text transaction → a message row for the watched address. */
export function toNewMessage(tx: BlockscoutTx, watched: string): db.NewMessage | null {
  if (!EVM_TX.test(tx.hash || '')) return null;
  if (tx.status && tx.status !== 'ok') return null;
  if (tx.result && tx.result !== 'success') return null;
  const ms = Date.parse(String(tx.timestamp ?? ''));
  if (!Number.isFinite(ms)) return null;
  const content = evmText(tx.raw_input);
  if (content == null) return null;
  const from = tx.from?.hash && isEvmAddress(tx.from.hash) ? tx.from.hash.toLowerCase() : null;
  const to = tx.to?.hash && isEvmAddress(tx.to.hash) ? tx.to.hash.toLowerCase() : null;
  const address = watched.toLowerCase();
  return {
    txid: tx.hash.toLowerCase(),
    address,
    content,
    raw_hex: null,
    is_mempool: false,
    fee_sats: null,
    fee_rate: null,
    block_time: Math.floor(ms / 1000),
    // Ethereum heights must never reach /block/:height, which is Bitcoin.
    block_height: null,
    sender: from,
    protocol: 'text',
    recipient: to,
    monitored_address: address,
    content_hash: db.contentHash(content),
    ops: [],
    detail_tries: 3,
  };
}

/**
 * Backfill cursor after one older page: the page's next params, or 'done'
 * when there is none. A missing or unreadable stored cursor restarts from
 * the newest page's next params.
 */
export function startCursor(stored: string | undefined, newest: BlockscoutPage): Record<string, unknown> | 'done' {
  if (stored === 'done') return 'done';
  if (stored) {
    try {
      const v = JSON.parse(stored);
      if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length) return v as Record<string, unknown>;
    } catch {
      // fall through to a restart
    }
  }
  return newest.next_page_params ?? 'done';
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export function blockscoutBase(env: Pick<Env, 'ETH_BLOCKSCOUT_URL'>): string {
  return (env.ETH_BLOCKSCOUT_URL || 'https://eth.blockscout.com').replace(/\/+$/, '');
}

export async function fetchPage(
  base: string,
  address: string,
  params: Record<string, unknown> | null,
  fetchFn: FetchLike = fetch
): Promise<BlockscoutPage> {
  const qs = params ? '?' + new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString() : '';
  const res = await fetchFn(`${base}/api/v2/addresses/${address}/transactions${qs}`, {
    headers: { accept: 'application/json', 'user-agent': 'opreturn.xyz (+https://opreturn.xyz)' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`blockscout ${res.status} for ${address}`);
  const body = (await res.json()) as Partial<BlockscoutPage>;
  if (!Array.isArray(body.items)) throw new Error(`blockscout: no items for ${address}`);
  return { items: body.items, next_page_params: body.next_page_params ?? null };
}

export interface EvmPollResult {
  inserted: number;
  failed: number;
}

/** Storage the poller needs; the defaults are D1, tests pass fakes. */
export interface EvmDeps {
  fetchFn?: FetchLike;
  insert?: (row: db.NewMessage) => Promise<boolean>;
  getState?: () => Promise<Record<string, string>>;
  setState?: (key: string, value: string) => Promise<void>;
}

/**
 * Poll every watched Ethereum address: the newest page each run, plus up to
 * three older pages until the history is in. One failing address never stops
 * the others. EVM_POLL = "0" turns it off.
 */
export async function pollEvmAddresses(env: Env, addresses: string[], deps: EvmDeps = {}): Promise<EvmPollResult> {
  const out: EvmPollResult = { inserted: 0, failed: 0 };
  if (env.EVM_POLL === '0' || addresses.length === 0) return out;
  const fetchFn = deps.fetchFn ?? fetch;
  const insert = deps.insert ?? ((row: db.NewMessage) => db.insertMessage(env.DB, row));
  const getState = deps.getState ?? (() => db.getIngestState(env.DB));
  const setState = deps.setState ?? ((key: string, value: string) => db.setIngestState(env.DB, { [key]: value }));
  const base = blockscoutBase(env);
  const started = Date.now();
  const state = await getState().catch(() => ({} as Record<string, string>));

  const storePage = async (page: BlockscoutPage, watched: string): Promise<number> => {
    let n = 0;
    for (const tx of page.items) {
      // One malformed item must not drop the rest of the page.
      if (!tx || typeof tx !== 'object' || typeof tx.hash !== 'string') continue;
      const row = toNewMessage(tx, watched);
      if (row && (await insert(row))) n++;
    }
    return n;
  };

  const results = await Promise.allSettled(
    addresses.map(async (raw) => {
      const address = raw.toLowerCase();
      const key = `evm_backfill:${address}`;
      const newest = await fetchPage(base, address, null, fetchFn);
      let inserted = await storePage(newest, address);
      let cursor = startCursor(state[key], newest);
      for (let i = 0; i < BACKFILL_PAGES_PER_RUN && cursor !== 'done' && Date.now() - started < BACKFILL_BUDGET_MS; i++) {
        const page = await fetchPage(base, address, cursor, fetchFn);
        inserted += await storePage(page, address);
        cursor = page.next_page_params ?? 'done';
        await setState(key, cursor === 'done' ? 'done' : JSON.stringify(cursor));
      }
      return inserted;
    })
  );
  for (const r of results) {
    if (r.status === 'fulfilled') out.inserted += r.value;
    else {
      out.failed++;
      console.error('evm poll:', String(r.reason).slice(0, 200));
    }
  }
  return out;
}
