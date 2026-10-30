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
/** No new backfill page starts after this long on the backlog (counted after the newest page is stored). */
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

export class BlockscoutError extends Error {
  constructor(public status: number, address: string) {
    super(`blockscout ${status} for ${address}`);
  }
}

const RELAY_HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/** Valid relay hosts from EGRESS_RELAYS (scheme and trailing slashes stripped, junk skipped). */
export function relayHosts(env: Pick<Env, 'EGRESS_RELAYS'>): string[] {
  return (env.EGRESS_RELAYS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, ''))
    .filter((h) => RELAY_HOST.test(h));
}

/** Statuses worth another route: per-IP limits (429), blocks (403) and upstream/relay failures. */
const RETRY_STATUS = new Set([403, 429, 500, 502, 503, 504]);

export async function fetchPage(
  base: string,
  address: string,
  params: Record<string, unknown> | null,
  fetchFn: FetchLike = fetch,
  apiKey?: string,
  /** Relay host to go through (https://<host>/proxy/<url>); omitted = direct. */
  via?: string
): Promise<BlockscoutPage> {
  const entries = Object.entries(params || {}).map(([k, v]): [string, string] => [k, String(v)]);
  if (apiKey) entries.push(['apikey', apiKey]);
  const qs = entries.length ? '?' + new URLSearchParams(entries).toString() : '';
  const target = `${base}/api/v2/addresses/${address}/transactions${qs}`;
  const res = await fetchFn(via ? `https://${via}/proxy/${target}` : target, {
    headers: { accept: 'application/json', 'user-agent': 'opreturn.xyz (+https://opreturn.xyz)' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new BlockscoutError(res.status, address);
  const body = (await res.json()) as Partial<BlockscoutPage>;
  if (!Array.isArray(body.items)) throw new Error(`blockscout: no items for ${address}`);
  return { items: body.items, next_page_params: body.next_page_params ?? null };
}

export interface EvmPollResult {
  inserted: number;
  failed: number;
  /** Older pages fetched this run (0 once every backlog is done). */
  pages?: number;
  ms?: number;
}

/** Storage the poller needs; the defaults are D1, tests pass fakes. */
export interface EvmDeps {
  fetchFn?: FetchLike;
  insert?: (row: db.NewMessage) => Promise<boolean>;
  /** Which of these txids are already stored (one query per page instead of one write per row). */
  known?: (txids: string[]) => Promise<Set<string>>;
  /** Pause between requests (tests pass 0). */
  gapMs?: number;
  getState?: () => Promise<Record<string, string>>;
  setState?: (key: string, value: string) => Promise<void>;
}

/** Pause between Blockscout requests (relays carry most of them; direct shares Cloudflare's egress IPs). */
const REQUEST_GAP_MS = 500;

/**
 * Poll every watched Ethereum address, one request at a time: first the
 * newest page of each address, then older pages until each history is in.
 * A 429 ends the poll for this run (no hammering); any other failure only
 * skips that address. EVM_POLL = "0" turns it off.
 */
export async function pollEvmAddresses(env: Env, addresses: string[], deps: EvmDeps = {}): Promise<EvmPollResult> {
  const out: EvmPollResult = { inserted: 0, failed: 0 };
  if (env.EVM_POLL === '0' || addresses.length === 0) return out;
  const fetchFn = deps.fetchFn ?? fetch;
  const insert = deps.insert ?? ((row: db.NewMessage) => db.insertMessage(env.DB, row));
  const getState = deps.getState ?? (() => db.getIngestState(env.DB));
  const setState = deps.setState ?? ((key: string, value: string) => db.setIngestState(env.DB, { [key]: value }));
  const known = deps.known ?? ((txids: string[]) => db.knownTxids(env.DB, txids));
  const gap = deps.gapMs ?? REQUEST_GAP_MS;
  const base = blockscoutBase(env);
  const apiKey = env.ETH_BLOCKSCOUT_API_KEY || undefined;
  const started = Date.now();
  const state = await getState().catch(() => ({} as Record<string, string>));
  const errors: string[] = [];
  let pages = 0;
  let requests = 0;
  let limited = false;

  const storePage = async (page: BlockscoutPage, watched: string): Promise<number> => {
    // One malformed item must not drop the rest of the page.
    const rows = page.items
      .filter((tx) => tx && typeof tx === 'object' && typeof tx.hash === 'string')
      .map((tx) => toNewMessage(tx, watched))
      .filter((r): r is db.NewMessage => r !== null);
    if (!rows.length) return 0;
    // Every run re-reads the newest page; rows already stored cost one SELECT, not a write each.
    const seen = await known(rows.map((r) => r.txid));
    let n = 0;
    for (const row of rows) if (!seen.has(row.txid) && (await insert(row))) n++;
    return n;
  };

  const relays = relayHosts(env);
  /**
   * One request: through the relays first (rotated, so load spreads), direct last. A retryable
   * status or network error moves to the next route; any other status stops. Null when every
   * route failed (recorded) or the run is rate-limited (every route answered 429).
   */
  const get = async (address: string, params: Record<string, unknown> | null): Promise<BlockscoutPage | null> => {
    if (limited) return null;
    const n = requests++;
    if (n > 0 && gap > 0) await new Promise((r) => setTimeout(r, gap));
    const routes: Array<string | undefined> = [...relays.slice(n % (relays.length || 1)), ...relays.slice(0, n % (relays.length || 1)), undefined];
    let all429 = true;
    for (const via of routes) {
      try {
        return await fetchPage(base, address, params, fetchFn, apiKey, via);
      } catch (e) {
        const status = e instanceof BlockscoutError ? e.status : 0;
        if (status !== 429) all429 = false;
        errors.push(`${via ?? 'direct'}: ${String(e).slice(0, 100)}`);
        console.error('evm poll:', via ?? 'direct', String(e).slice(0, 200));
        if (status && !RETRY_STATUS.has(status)) return null;
      }
    }
    if (all429) limited = true;
    return null;
  };

  const newest = new Map<string, BlockscoutPage>();
  const failed = new Set<string>();
  for (const raw of addresses) {
    const address = raw.toLowerCase();
    const page = await get(address, null);
    if (!page) {
      failed.add(address);
      continue;
    }
    newest.set(address, page);
    out.inserted += await storePage(page, address);
  }

  const backlogStart = Date.now();
  for (const [address, first] of newest) {
    const key = `evm_backfill:${address}`;
    let cursor = startCursor(state[key], first);
    for (let i = 0; i < BACKFILL_PAGES_PER_RUN && cursor !== 'done' && Date.now() - backlogStart < BACKFILL_BUDGET_MS; i++) {
      const page = await get(address, cursor);
      if (!page) break;
      pages++;
      out.inserted += await storePage(page, address);
      cursor = page.next_page_params ?? 'done';
      await setState(key, cursor === 'done' ? 'done' : JSON.stringify(cursor));
    }
  }

  out.failed = failed.size;
  out.pages = pages;
  out.ms = Date.now() - started;
  // The scheduled handler does not log its summary; leave a trace like the classifier does.
  await setState('evm_last_run', JSON.stringify({ at: new Date().toISOString(), ...out, rate_limited: limited, errors })).catch(() => undefined);
  return out;
}
