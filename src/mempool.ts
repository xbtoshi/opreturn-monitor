import type { Env } from './types';

export interface RawTx {
  txid: string;
  hex?: string;
  status?: { confirmed?: boolean; block_time?: number; block_height?: number };
  vout?: Array<{
    scriptpubkey?: string;
    scriptpubkey_type?: string;
    scriptpubkey_address?: string;
    value?: number;
  }>;
  vin?: Array<{ prevout?: { scriptpubkey_address?: string } | null }>;
  fee?: number;
  weight?: number;
}

export interface BlockHeader {
  id: string;
  height: number;
  timestamp: number;
  tx_count: number;
  size: number;
  previousblockhash?: string;
}

export interface TxFee {
  feeSats: number | null;
  feeRate: number | null;
}

const DEFAULT_PRIMARY = 'https://mempool.space';
const DEFAULT_FALLBACKS = 'https://mempool.space,https://blockstream.info';

/** Ordered list of Esplora-style hosts: configured primary first, then fallbacks. */
export function mempoolHosts(env: Pick<Env, 'MEMPOOL_BASE_URL' | 'MEMPOOL_FALLBACKS'>): string[] {
  const primary = (env.MEMPOOL_BASE_URL || DEFAULT_PRIMARY).trim();
  const fallbacks = (env.MEMPOOL_FALLBACKS || DEFAULT_FALLBACKS).split(',');
  return [...new Set([primary, ...fallbacks].map((h) => h.trim().replace(/\/+$/, '')).filter(Boolean))];
}

/** On-chain confirmation time (unix seconds), or null if unconfirmed. */
export function blockTimeFromTx(tx: RawTx): number | null {
  const t = tx.status?.block_time;
  return typeof t === 'number' && Number.isFinite(t) && t > 0 ? t : null;
}

export function blockHeightFromTx(tx: RawTx): number | null {
  const h = tx.status?.block_height;
  return typeof h === 'number' && Number.isFinite(h) && h > 0 ? h : null;
}

/**
 * Who wrote the message: the address funding the first input. Both the
 * address-txs and tx-detail endpoints include vin[].prevout, so this works for
 * live polling and for backfilling older rows. Null for coinbase / non-standard
 * inputs, or when the payload omits prevouts.
 */
export function senderFromTx(tx: RawTx): string | null {
  const a = tx.vin?.[0]?.prevout?.scriptpubkey_address;
  return typeof a === 'string' && a.length > 0 ? a : null;
}

/** Total fee (sats) + fee rate (sat/vB) from a mempool.space tx payload. */
export function feeFromTx(tx: RawTx): TxFee {
  const fee = typeof tx.fee === 'number' && Number.isFinite(tx.fee) ? tx.fee : null;
  const weight = typeof tx.weight === 'number' && tx.weight > 0 ? tx.weight : null;
  const feeRate = fee != null && weight != null ? fee / (weight / 4) : null;
  return { feeSats: fee, feeRate: feeRate != null ? Math.round(feeRate * 10) / 10 : null };
}

let cachedBase: string | null = null;

/**
 * Probe the hosts once (cheap /api/blocks/tip/height call) and remember the
 * first that responds, so subsequent address fetches don't re-burn timeouts
 * on a dead host.
 */
export async function resolveMempoolBase(hosts: string[]): Promise<string> {
  if (cachedBase && hosts.includes(cachedBase)) return cachedBase;
  for (const base of hosts) {
    try {
      const res = await fetchWithTimeout(`${base}/api/blocks/tip/height`, 5000);
      if (res.ok) {
        cachedBase = base;
        return base;
      }
    } catch {
      // try next base
    }
  }
  return hosts[0];
}

export function resetMempoolBaseCache(): void {
  cachedBase = null;
}

/** Hosts ordered with the last known-good one first. */
function ordered(hosts: string[]): string[] {
  return cachedBase && hosts.includes(cachedBase) ? [cachedBase, ...hosts.filter((h) => h !== cachedBase)] : hosts;
}

async function fetchWithTimeout(url: string, timeoutMs = 8000, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: { accept: 'application/json' },
      cf: { cacheTtl: 60, cacheEverything: true },
      ...init,
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson<T>(url: string, timeoutMs = 8000): Promise<T | null> {
  const res = await fetchWithTimeout(url, timeoutMs);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function fetchText(url: string, timeoutMs = 8000): Promise<string> {
  const res = await fetchWithTimeout(url, timeoutMs);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.text()).trim();
}

/** Try each host in turn; null when every host fails. */
async function firstOk<T>(hosts: string[], fn: (base: string) => Promise<T | null>): Promise<T | null> {
  for (const base of ordered(hosts)) {
    try {
      const v = await fn(base);
      if (v != null) return v;
    } catch {
      // try next base
    }
  }
  return null;
}

/** Fetch a single transaction by txid (detail endpoint includes fee/weight). */
export async function fetchTxById(hosts: string[], txid: string): Promise<RawTx | null> {
  return firstOk(hosts, async (base) => {
    const tx = await fetchJson<RawTx>(`${base}/api/tx/${txid}`);
    return tx && tx.txid ? tx : null;
  });
}

export async function fetchTipHeight(hosts: string[]): Promise<number | null> {
  return firstOk(hosts, async (base) => {
    const n = Number(await fetchText(`${base}/api/blocks/tip/height`, 5000));
    return Number.isFinite(n) && n > 0 ? n : null;
  });
}

export async function fetchBlockHashAt(hosts: string[], height: number): Promise<string | null> {
  return firstOk(hosts, async (base) => {
    const h = await fetchText(`${base}/api/block-height/${height}`, 8000);
    return /^[0-9a-f]{64}$/.test(h) ? h : null;
  });
}

export async function fetchBlockHeader(hosts: string[], hash: string): Promise<BlockHeader | null> {
  return firstOk(hosts, async (base) => {
    const b = await fetchJson<BlockHeader>(`${base}/api/block/${hash}`);
    return b && typeof b.height === 'number' ? b : null;
  });
}

/**
 * Raw block bytes. Binary, ~1.5-4 MB, so no JSON accept header, no edge
 * caching of the body, and a longer timeout than the JSON calls.
 */
export async function fetchRawBlock(hosts: string[], hash: string): Promise<Uint8Array | null> {
  return firstOk(hosts, async (base) => {
    const res = await fetchWithTimeout(`${base}/api/block/${hash}/raw`, 45000, {
      headers: { accept: 'application/octet-stream' },
      cf: { cacheTtl: 0 },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    return buf.length > 80 ? buf : null;
  });
}

/**
 * Fetch recent confirmed + mempool transactions for an address.
 * Tries the configured base first, then falls back to alternate public APIs.
 * Returns [] if every source fails.
 */
export async function fetchAddressTxs(
  hosts: string[],
  address: string
): Promise<{ txs: RawTx[]; ok: boolean; complete: boolean }> {
  for (const base of ordered(hosts)) {
    const results = await Promise.allSettled([
      fetchJson<RawTx[]>(`${base}/api/address/${address}/txs`),
      fetchJson<RawTx[]>(`${base}/api/address/${address}/txs/mempool`),
    ]);

    const txs: RawTx[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) txs.push(...r.value);
    }
    if (txs.length > 0 || results.every((r) => r.status === 'fulfilled')) {
      // complete: both endpoints answered, so the mempool view is trustworthy
      // (safe to treat missing txids as replaced/evicted).
      return { txs, ok: true, complete: results.every((r) => r.status === 'fulfilled') };
    }
  }

  return { txs: [], ok: false, complete: false };
}

interface HistoricalPrice {
  prices?: Array<{ USD?: number }>;
}

/**
 * USD price at (or nearest to) the given unix timestamp. Only mempool-style
 * hosts have this endpoint (blockstream.info does not); failures fall through.
 */
export async function fetchHistoricalPriceUsd(hosts: string[], ts: number): Promise<number | null> {
  return firstOk(hosts, async (base) => {
    const data = await fetchJson<HistoricalPrice>(`${base}/api/v1/historical-price?timestamp=${ts}&currency=USD`);
    const usd = data?.prices?.[0]?.USD;
    return typeof usd === 'number' && Number.isFinite(usd) && usd > 0 ? usd : null;
  });
}
