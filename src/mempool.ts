export interface RawTx {
  txid: string;
  hex?: string;
  status?: { confirmed?: boolean; block_time?: number };
  vout?: Array<{ scriptpubkey?: string; scriptpubkey_type?: string }>;
  fee?: number;
  weight?: number;
}

export interface TxFee {
  feeSats: number | null;
  feeRate: number | null;
}

/** On-chain confirmation time (unix seconds), or null if unconfirmed. */
export function blockTimeFromTx(tx: RawTx): number | null {
  const t = tx.status?.block_time;
  return typeof t === 'number' && Number.isFinite(t) && t > 0 ? t : null;
}

/** Total fee (sats) + fee rate (sat/vB) from a mempool.space tx payload. */
export function feeFromTx(tx: RawTx): TxFee {
  const fee = typeof tx.fee === 'number' && Number.isFinite(tx.fee) ? tx.fee : null;
  const weight = typeof tx.weight === 'number' && tx.weight > 0 ? tx.weight : null;
  const feeRate = fee != null && weight != null ? fee / (weight / 4) : null;
  return { feeSats: fee, feeRate: feeRate != null ? Math.round(feeRate * 10) / 10 : null };
}
const FALLBACK_BASES = ['https://www.mempool.space', 'https://blockstream.info'];

let cachedBase: string | null = null;

/**
 * Probe the configured base + fallbacks once (cheap /api/blocks/tip/height
 * call) and remember the first that responds, so subsequent address fetches
 * don't re-burn timeouts on a dead host. Reset on fetch failures.
 */
export async function resolveMempoolBase(baseUrl: string): Promise<string> {
  if (cachedBase) return cachedBase;

  const bases = [...new Set([baseUrl.replace(/\/+$/, ''), ...FALLBACK_BASES])];
  for (const base of bases) {
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
  return bases[0];
}

export function resetMempoolBaseCache(): void {
  cachedBase = null;
}

async function fetchWithTimeout(url: string, timeoutMs = 8000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: { accept: 'application/json' },
      signal: ctrl.signal,
      cf: { cacheTtl: 60, cacheEverything: true },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Fetch a single transaction by txid (detail endpoint includes fee/weight). */
export async function fetchTxById(baseUrl: string, txid: string): Promise<RawTx | null> {
  const bases = [...new Set([baseUrl.replace(/\/+$/, ''), ...FALLBACK_BASES])];
  for (const base of bases) {
    try {
      const tx = await fetchJson<RawTx>(`${base}/api/tx/${txid}`);
      if (tx && tx.txid) return tx;
    } catch {
      // try next base
    }
  }
  return null;
}

/**
 * Fetch recent confirmed + mempool transactions for an address.
 * Tries the configured base first, then falls back to alternate public APIs.
 * Returns [] if every source fails.
 */
export async function fetchAddressTxs(
  baseUrl: string,
  address: string
): Promise<{ txs: RawTx[]; ok: boolean; complete: boolean }> {
  const bases = [...new Set([baseUrl.replace(/\/+$/, ''), ...FALLBACK_BASES])];

  for (const base of bases) {
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
 * USD price at (or nearest to) the given unix timestamp. Blockstream has no
 * price endpoint, so this only tries mempool.space hosts. Null if all fail.
 */
export async function fetchHistoricalPriceUsd(baseUrl: string, ts: number): Promise<number | null> {
  const bases = [
    ...new Set([baseUrl.replace(/\/+$/, ''), 'https://mempool.space', 'https://www.mempool.space']),
  ];
  for (const base of bases) {
    try {
      const data = await fetchJson<HistoricalPrice>(
        `${base}/api/v1/historical-price?timestamp=${ts}&currency=USD`
      );
      const usd = data?.prices?.[0]?.USD;
      if (typeof usd === 'number' && Number.isFinite(usd) && usd > 0) return usd;
    } catch {
      // try next base
    }
  }
  return null;
}

/**
 * Decode a raw scriptPubKey hex string that starts with OP_RETURN (0x6a)
 * and return the pushed data as a UTF-8 string. Returns null if the script
 * is not a valid/decodable OP_RETURN.
 */
export function decodeOpReturn(scriptHex: string): string | null {
  const buf = hexToBytes(scriptHex);
  if (buf.length < 2 || buf[0] !== 0x6a) return null;

  let i = 1;
  let len = 0;

  if (buf[i] === 0x4c) {
    // OP_PUSHDATA1
    if (i + 1 >= buf.length) return null;
    len = buf[i + 1];
    i += 2;
  } else if (buf[i] === 0x4d) {
    // OP_PUSHDATA2
    if (i + 2 >= buf.length) return null;
    len = buf[i + 1] | (buf[i + 2] << 8);
    i += 3;
  } else if (buf[i] === 0x4e) {
    // OP_PUSHDATA4
    if (i + 4 >= buf.length) return null;
    len = buf[i + 1] | (buf[i + 2] << 8) | (buf[i + 3] << 16) | (buf[i + 4] << 24);
    i += 5;
  } else {
    len = buf[i];
    i += 1;
  }

  if (len <= 0 || i >= buf.length) return null;
  const end = Math.min(i + len, buf.length);
  return new TextDecoder('utf-8').decode(buf.subarray(i, end));
}

/**
 * Extract non-empty, readable OP_RETURN texts from a transaction.
 * Multiple OP_RETURN outputs are joined with a newline separator.
 */
export function extractOpReturnText(tx: RawTx): string | null {
  if (!tx.vout?.length) return null;
  const texts: string[] = [];

  for (const out of tx.vout) {
    if (out.scriptpubkey_type !== 'op_return' || !out.scriptpubkey) continue;
    try {
      const text = decodeOpReturn(out.scriptpubkey);
      if (text && isReadableText(text)) texts.push(text.trim());
    } catch {
      // skip malformed scripts
    }
  }

  if (texts.length === 0) return null;
  return [...new Set(texts)].join('\n');
}

function isReadableText(s: string): boolean {
  if (s.trim().length === 0) return false;
  let printable = 0;
  let replacement = 0;
  for (const ch of s) {
    if (ch === '\uFFFD') replacement++;
    else if (ch >= ' ') printable++;
  }
  const n = Math.max(1, s.length);
  return replacement / n < 0.4 && printable / n >= 0.6;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.length % 2 ? '0' + hex : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
