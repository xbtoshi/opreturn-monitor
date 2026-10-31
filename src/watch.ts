/**
 * Phone alert (ntfy) when a watched Binance-hack wallet moves funds out.
 *
 * Four signals per wallet, each with its own cursor, seeded on its first
 * successful read and never moved by another signal:
 *   tx  outgoing transactions it signed (failed ones skipped)
 *   tt  token transfers out, priced tokens with a nonzero amount only: most of
 *       0x5227's list is address-poisoning spam (fake "ETH"/"USDT" with no
 *       price, 0-value transfers of real WBTC)
 *   it  internal transactions out: ETH moved by code running as the wallet
 *       (an EIP-7702 delegation), which no tx of its own shows
 *   bal ETH balance: a drop of ≥ 0.05 ETH not explained by its own
 *       transactions is the backstop for anything the lists miss; the same
 *       read reports an EIP-7702 delegation, alerted as soon as it appears
 * Verified live (31 Oct 2026): Blockscout lists internal calls made by a
 * delegated EOA's code under its own internal-transactions?filter=from, even
 * when another account sent the outer type-4 tx (fixture internal_7702).
 * Cursors are block numbers plus the ids seen at that block, so a dropped or
 * reorged item never matches and re-reading a page never re-alerts. Pending
 * items are ignored until confirmed. An item reorged in below a cursor is not
 * detected (accepted; the balance signal still sees its ETH effect).
 *
 * Known limits (accepted): unpriced real tokens and NFTs are not reported; a
 * signal that cannot be read before its first seed misses what happened in
 * that window (the health alert below says so within ~9 minutes); more than
 * three pages of new items in one run are summarised with an Etherscan link,
 * or, when none of them is priced, a low-priority "busy" notice (every such
 * run); "explained" only sees the newest pages, so a balance read lagging
 * behind more than a page of sends can repeat them as a balance line (a
 * duplicate, never a miss).
 *
 * Health: a run with an unread, unseeded or stale signal, or a hit deadline,
 * is degraded. After three in a row one low-priority "watch degraded" alert
 * goes out (repeated at most every 6 h), and one "recovered" after a clean run.
 *
 * Delivery is at least once: if the state write fails after a send, the next
 * run alerts again. The topic is the credential; it never reaches logs or
 * state. Kill switch: WATCH_POLL = "0".
 */
import * as db from './db';
import { blockscoutClient, relayHosts, type FetchLike } from './evm';
import type { Env } from './types';

const PAGES_PER_SIGNAL = 3;
const REQUEST_TIMEOUT_MS = 10_000;
const DEADLINE_MS = 60_000;
const GAP_MS = 250;
const MAX_LINES = 6;
const WEI = 10n ** 18n;
/** Unexplained balance drop that alerts: 0.05 ETH (~4% of the smallest 1.2 ETH wallet; a swap's gas is ~0.0002). */
const BALANCE_DROP_WEI = WEI / 20n;
const BIG_USD = 10_000;
const DEGRADED_AFTER = 3;
const DEGRADED_REPEAT_MS = 6 * 3600_000;
const SEND_TIMEOUT_MS = 3000;
const RETRY_STATUS = new Set([403, 429, 500, 502, 503, 504]);

export function isNtfyTopic(s: unknown): s is string {
  return typeof s === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(s);
}

type Kind = 'tx' | 'tt' | 'it';
const KINDS: Kind[] = ['tx', 'tt', 'it'];
const PATHS: Record<Kind, string> = { tx: 'transactions', tt: 'token-transfers', it: 'internal-transactions' };

interface Cursor {
  block: number;
  seen: string[];
}
interface Balance {
  wei: string;
  at: number;
}
export interface WatchState {
  tx?: Cursor;
  tt?: Cursor;
  it?: Cursor;
  bal?: Balance;
  /** EIP-7702 delegate the wallet's code points to (null = none). */
  deleg?: string | null;
}

/** One confirmed item from a list, normalised. */
export interface Item {
  id: string;
  kind: Kind;
  block: number;
  /** Order within the block (log or internal index; 0 for transactions). */
  pos: number;
  txHash: string;
  /** Worth a line: succeeded and moved something (or, for tx, any successful call). */
  counted: boolean;
  to: string | null;
  /** ETH moved, in wei (tx and it). */
  value: bigint;
  /** Fee paid, in wei (tx only, failed ones too). */
  fee: bigint;
  ok: boolean;
  method?: string | null;
  amount?: bigint;
  decimals?: number | null;
  symbol?: string;
  usd?: number;
}

type Raw = Record<string, any>;
const lc = (s: unknown) => (typeof s === 'string' ? s.toLowerCase() : '');
const big = (s: unknown): bigint => {
  try {
    return typeof s === 'string' || typeof s === 'number' ? BigInt(s) : 0n;
  } catch {
    return 0n;
  }
};

export function toItem(kind: Kind, raw: Raw, address: string): Item | null {
  if (!raw || typeof raw !== 'object' || typeof raw.block_number !== 'number') return null;
  if (lc(raw.from?.hash) !== address) return null;
  const to = raw.to?.hash ? lc(raw.to.hash) : null;
  if (kind === 'tx') {
    if (typeof raw.hash !== 'string') return null;
    const ok = raw.status === 'ok' && raw.result === 'success';
    const fee = big(typeof raw.fee === 'object' && raw.fee ? raw.fee.value : raw.fee);
    return { id: `tx:${lc(raw.hash)}`, kind, block: raw.block_number, pos: 0, txHash: lc(raw.hash), counted: ok, to, value: ok ? big(raw.value) : 0n, fee, ok, method: raw.method ?? null };
  }
  if (typeof raw.transaction_hash !== 'string') return null;
  const txHash = lc(raw.transaction_hash);
  if (kind === 'it') {
    const ok = raw.success !== false && !raw.error;
    const value = ok ? big(raw.value) : 0n;
    return { id: `it:${txHash}:${raw.index}`, kind, block: raw.block_number, pos: Number(raw.index) || 0, txHash, counted: value > 0n, to, value, fee: 0n, ok };
  }
  // Token metadata is attacker-controlled (address-poisoning tokens): bound it before BigInt math.
  const amountRaw = String(raw.total?.value ?? '');
  const amount = /^\d{1,80}$/.test(amountRaw) ? BigInt(amountRaw) : 0n;
  const decimals = validDecimals(raw.total?.decimals) ?? validDecimals(raw.token?.decimals);
  const rate = raw.token?.exchange_rate;
  const priced = rate !== null && rate !== undefined && rate !== '' && Number.isFinite(Number(rate));
  const usd = priced && decimals !== null ? Number(formatUnits(amount, decimals, 8).replace(/,/g, '')) * Number(rate) : undefined;
  return {
    id: `tt:${txHash}:${raw.log_index}`, kind, block: raw.block_number, pos: Number(raw.log_index) || 0, txHash,
    counted: priced && amount > 0n, to, value: 0n, fee: 0n, ok: true,
    amount, decimals, symbol: String(raw.token?.symbol ?? '?').slice(0, 16), usd,
  };
}

const MAX_DECIMALS = 36;
function validDecimals(d: unknown): number | null {
  const n = typeof d === 'number' ? d : typeof d === 'string' && /^\d{1,3}$/.test(d) ? Number(d) : NaN;
  return Number.isInteger(n) && n >= 0 && n <= MAX_DECIMALS ? n : null;
}

/** Integer units → "1,234.5678" (at most `places` decimals, trailing zeros dropped). */
export function formatUnits(v: bigint, decimals: number, places = 4): string {
  const neg = v < 0n;
  const a = neg ? -v : v;
  const unit = 10n ** BigInt(decimals);
  const whole = (a / unit).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = decimals ? (a % unit).toString().padStart(decimals, '0').slice(0, places).replace(/0+$/, '') : '';
  return (neg ? '-' : '') + whole + (frac ? '.' + frac : '');
}

const short = (a: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : 'new contract');
const isNew = (c: Cursor, it: Item) => it.block > c.block || (it.block === c.block && !c.seen.includes(it.id));

export function lineFor(it: Item): string {
  if (it.kind === 'tt') {
    const amt = it.decimals === null || it.decimals === undefined ? `${it.amount} raw` : formatUnits(it.amount ?? 0n, it.decimals);
    const usd = it.usd !== undefined && Number.isFinite(it.usd) ? ` (~$${Math.round(it.usd).toLocaleString('en-US')})` : '';
    return `${amt} ${it.symbol}${usd} → ${short(it.to)}`;
  }
  if (it.kind === 'it') return `${formatUnits(it.value, 18)} ETH by contract code → ${short(it.to)}`;
  if (it.value > 0n) return `${formatUnits(it.value, 18)} ETH → ${short(it.to)}`;
  return `call ${(it.method || 'unknown').slice(0, 40)} → ${short(it.to)}`;
}

/** Cursor after reading `items` (all confirmed items fetched, new or not). */
function advance(c: Cursor | undefined, items: Item[]): Cursor {
  const top = Math.max(c?.block ?? 0, ...items.map((i) => i.block));
  const at = items.filter((i) => i.block === top).map((i) => i.id);
  const seen = c && c.block === top ? [...new Set([...c.seen, ...at])] : at;
  return { block: top, seen };
}

interface Read {
  items: Item[];
  truncated: boolean;
}

export interface WatchDeps {
  fetchFn?: FetchLike;
  gapMs?: number;
  now?: () => number;
  getState?: () => Promise<Record<string, string>>;
  setState?: (key: string, value: string) => Promise<void>;
}

export interface WatchResult {
  skipped?: string;
  checked: number;
  alerts: number;
  items: number;
  send_failed: number;
  request_failed: number;
  stale: number;
  truncated: number;
  unseeded: string[];
  timed_out: boolean;
  degraded: boolean;
  ms: number;
}

export interface Watched {
  address: string;
  label: string | null;
}

export async function watchEvmOutflows(env: Env, wallets: Watched[], deps: WatchDeps = {}): Promise<WatchResult> {
  const now = deps.now ?? Date.now;
  const started = now();
  const out: WatchResult = { checked: 0, alerts: 0, items: 0, send_failed: 0, request_failed: 0, stale: 0, truncated: 0, unseeded: [], timed_out: false, degraded: false, ms: 0 };
  if (env.WATCH_POLL === '0') return { ...out, skipped: 'off' };
  const topic = env.NTFY_TOPIC;
  if (!isNtfyTopic(topic)) return { ...out, skipped: 'no topic' };
  if (!wallets.length) return { ...out, skipped: 'no wallets' };
  const fetchFn = deps.fetchFn ?? fetch;
  const getState = deps.getState ?? (() => db.getIngestState(env.DB));
  const setState = deps.setState ?? ((k: string, v: string) => db.setIngestState(env.DB, { [k]: v }));
  const client = blockscoutClient(env, { fetchFn, gapMs: deps.gapMs ?? GAP_MS, timeoutMs: REQUEST_TIMEOUT_MS, deadline: started + DEADLINE_MS, label: 'watch', now });
  const ntfy = (title: string, body: string, priority: number, click?: string) => sendNtfy(env, topic, title, body, priority, click, fetchFn);
  const state = await getState().catch(() => ({}) as Record<string, string>);
  const problems: string[] = [];

  for (const w of wallets) {
    const address = w.address.toLowerCase();
    const name = w.label || short(address);
    const key = `watch:${address}`;
    let st: WatchState = {};
    try {
      st = JSON.parse(state[key] || '{}') as WatchState;
    } catch {
      st = {};
    }

    const reads: Partial<Record<Kind, Read>> = {};
    for (const kind of KINDS) {
      const r = await readList(client, kind, address, st[kind]);
      if (r) reads[kind] = r;
      else {
        out.request_failed++;
        problems.push(`${short(address)} ${kind} unread`);
      }
    }
    const balRaw = await client.get(`/api/v2/addresses/${address}`, null, (b) => b as Raw, address);
    let bal: Balance | null = null;
    if (!balRaw) {
      out.request_failed++;
      problems.push(`${short(address)} balance unread`);
    } else if (typeof balRaw.coin_balance !== 'string' || typeof balRaw.block_number_balance_updated_at !== 'number' || (st.bal && balRaw.block_number_balance_updated_at < st.bal.at)) {
      out.stale++;
      problems.push(`${short(address)} balance stale`);
    } else bal = { wei: balRaw.coin_balance, at: balRaw.block_number_balance_updated_at };
    // A hacker wallet delegating its code (EIP-7702) can then be emptied by anyone it authorises: warn before a sweep.
    // Only a fresh read that carries the field counts; a stale or partial one is "unknown", never "removed".
    const deleg = bal && balRaw && 'proxy_type' in balRaw ? (balRaw.proxy_type === 'eip7702' ? lc(balRaw.implementations?.[0]?.address_hash) || 'unknown' : null) : undefined;
    const delegLine = deleg === undefined || deleg === (st.deleg ?? null) ? null
      : deleg ? `Wallet code delegated (EIP-7702) to ${deleg === 'unknown' ? 'an unknown contract' : short(deleg)}: it can now be emptied without a transaction of its own`
      : 'EIP-7702 delegation removed';

    // New, counted items per seeded signal (an unseeded signal only seeds).
    const fresh: Item[] = [];
    for (const kind of KINDS) {
      const r = reads[kind];
      const c = st[kind];
      if (!r || !c) continue;
      for (const it of r.items) if (isNew(c, it) && it.counted) fresh.push(it);
      if (r.truncated) out.truncated++;
    }
    // A 0-value call whose hash also moved a priced token or internal ETH says less than that line.
    const moved = new Set(fresh.filter((i) => i.kind !== 'tx').map((i) => i.txHash));
    const shown = fresh.filter((i) => !(i.kind === 'tx' && i.value === 0n && moved.has(i.txHash)));
    shown.sort((a, b) => b.block - a.block || b.pos - a.pos);
    const lines = shown.map(lineFor);

    let balanceLine: string | null = null;
    if (bal && st.bal) {
      const drop = big(st.bal.wei) - big(bal.wei);
      if (drop > 0n) {
        // Everything its own lists show leaving in the balance window, alerted before or not.
        const inWindow = (i: Item) => i.block > st.bal!.at && i.block <= bal!.at;
        let explained = 0n;
        for (const i of reads.tx?.items ?? []) if (inWindow(i)) explained += i.value + i.fee;
        for (const i of reads.it?.items ?? []) if (inWindow(i)) explained += i.value;
        if (drop - explained >= BALANCE_DROP_WEI) balanceLine = `ETH balance fell ${formatUnits(drop, 18)} (now ${formatUnits(big(bal.wei), 18)}), ${formatUnits(drop - explained, 18)} not from its own transactions`;
      }
    }

    const truncated = KINDS.some((k) => reads[k]?.truncated && st[k]);
    let sent = true;
    if (lines.length || balanceLine || delegLine) {
      const body = [
        ...(delegLine ? [delegLine] : []),
        ...(balanceLine ? [balanceLine] : []),
        ...lines.slice(0, MAX_LINES),
        ...(lines.length > MAX_LINES ? [`and ${lines.length - MAX_LINES} more`] : []),
        ...(truncated ? [`more than ${PAGES_PER_SIGNAL} pages of activity, see https://etherscan.io/address/${address}`] : []),
      ].join('\n');
      const big1 = shown.some((i) => i.value >= WEI || (i.usd ?? 0) >= BIG_USD);
      const click = shown[0] ? `https://etherscan.io/tx/${shown[0].txHash}` : `https://etherscan.io/address/${address}`;
      const urgent = balanceLine || big1 || (delegLine && deleg);
      sent = await ntfy(`Hack wallet moved: ${name}`, body, urgent ? 5 : 3, click);
      if (sent) {
        out.alerts++;
        out.items += shown.length + (balanceLine ? 1 : 0) + (delegLine ? 1 : 0);
      }
    } else if (truncated) {
      // Over three pages of new items, none priced or moving ETH (usually poisoning spam): anything
      // real underneath is past the cap, so say so every time rather than ever staying silent.
      sent = await ntfy(`Hack wallet busy: ${name}`, `More than ${PAGES_PER_SIGNAL} pages of new outgoing activity, none of it ETH or priced tokens on the newest pages. Check https://etherscan.io/address/${address}`, 2, `https://etherscan.io/address/${address}`);
      if (sent) out.alerts++;
    }
    if (!sent) {
      out.send_failed++;
      problems.push(`${short(address)} alert not delivered`);
      continue; // nothing advances: the next run alerts again
    }

    const next: WatchState = { ...st };
    for (const kind of KINDS) {
      const r = reads[kind];
      if (r) next[kind] = advance(st[kind], r.items);
      else if (!st[kind]) out.unseeded.push(`${short(address)} ${kind}`);
    }
    if (bal) next.bal = bal;
    else if (!st.bal) out.unseeded.push(`${short(address)} balance`);
    if (deleg !== undefined) next.deleg = deleg;
    if (KINDS.every((k) => reads[k]) && bal) out.checked++;
    await setState(key, JSON.stringify(next)).catch((e) => console.error('watch: state write failed', String(e).slice(0, 120)));
  }

  out.timed_out = client.timedOut();
  if (out.timed_out) problems.push('deadline hit');
  if (client.limited()) problems.push('Blockscout rate-limited on every route');
  for (const u of out.unseeded) problems.push(`${u} not armed`);
  out.degraded = problems.length > 0;
  await health(state.watch_health, [...new Set(problems)], now(), ntfy, setState);
  out.ms = now() - started;
  await setState('watch_last_run', JSON.stringify({ at: new Date(now()).toISOString(), ...out, errors: client.errors.slice(0, 10).map((e) => e.slice(0, 120)) })).catch(() => undefined);
  return out;
}

interface ListPage {
  items: Raw[];
  next_page_params?: Record<string, unknown> | null;
}
const toListPage = (address: string) => (b: unknown): ListPage => {
  const raw = b as Raw;
  if (!Array.isArray(raw?.items)) throw new Error(`blockscout: no items for ${address}`);
  return raw as ListPage;
};

/** Newest page, then older ones while every item on the page is still new (up to PAGES_PER_SIGNAL). */
async function readList(client: ReturnType<typeof blockscoutClient>, kind: Kind, address: string, c: Cursor | undefined): Promise<Read | null> {
  const items: Item[] = [];
  let params: Record<string, unknown> | null = { filter: 'from' };
  for (let page = 0; page < PAGES_PER_SIGNAL; page++) {
    const body: ListPage | null = await client.get(`/api/v2/addresses/${address}/${PATHS[kind]}`, params, toListPage(address), address);
    // Any page failing fails the signal for this run: advancing past page 1 would skip what page 2 holds.
    if (!body) return null;
    const got = body.items.map((r) => toItem(kind, r, address)).filter((i): i is Item => i !== null);
    items.push(...got);
    // Pending, foreign and malformed items do not count either way.
    const allNew = !!c && got.length > 0 && got.every((i) => isNew(c, i));
    if (!c || !allNew || !body.next_page_params) return { items, truncated: false };
    params = { ...body.next_page_params, filter: 'from' };
  }
  return { items, truncated: true };
}

interface Health {
  streak: number;
  notified_at?: number;
}

async function health(raw: string | undefined, problems: string[], now: number, send: (t: string, b: string, p: number) => Promise<boolean>, setState: (k: string, v: string) => Promise<void>) {
  let h: Health = { streak: 0 };
  try {
    h = { streak: 0, ...JSON.parse(raw || '{}') };
  } catch {
    /* fresh */
  }
  const next: Health = { ...h };
  if (!problems.length) {
    next.streak = 0;
    if (h.notified_at && (await send('Hack watch recovered', 'All watched wallets are being read again.', 2))) delete next.notified_at;
  } else {
    next.streak = h.streak + 1;
    if (next.streak >= DEGRADED_AFTER && (!h.notified_at || now - h.notified_at >= DEGRADED_REPEAT_MS)) {
      const body = `Not fully watching for ${next.streak} runs:\n${problems.slice(0, 8).join('\n')}`;
      if (await send('Hack watch degraded', body, 2)) next.notified_at = now;
    }
  }
  await setState('watch_health', JSON.stringify(next)).catch(() => undefined);
}

/** ntfy through our egress relays first (ntfy.sh limits anonymous publishing per IP), direct last. */
export async function sendNtfy(env: Env, topic: string, title: string, body: string, priority: number, click: string | undefined, fetchFn: FetchLike = fetch): Promise<boolean> {
  const target = `${(env.NTFY_BASE || 'https://ntfy.sh').trim().replace(/\/+$/, '')}/${topic}`;
  const headers: Record<string, string> = {
    // Header values must be ASCII.
    Title: title.replace(/[^\x20-\x7e]/g, '').slice(0, 120),
    Priority: String(priority),
    Tags: priority >= 5 ? 'rotating_light' : 'warning',
  };
  if (click) headers.Click = click;
  const publish = async (url: string, via: string): Promise<'ok' | 'retry' | 'stop'> => {
    try {
      const res = await fetchFn(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(SEND_TIMEOUT_MS) });
      if (res.ok) return 'ok';
      // Status only: a body could echo the URL, and the topic is the secret.
      console.error('watch: ntfy send failed', res.status, via);
      return RETRY_STATUS.has(res.status) ? 'retry' : 'stop';
    } catch (e) {
      console.error('watch: ntfy send failed', via, e instanceof Error ? e.name : 'error');
      return 'retry';
    }
  };
  for (const [i, host] of relayHosts(env).entries()) {
    const r = await publish(`https://${host}/proxy/${target}`, `relay ${i + 1}`);
    if (r === 'ok') return true;
    // Another status may be the relay's own (path, auth): skip the other relays, still try direct.
    if (r === 'stop') break;
  }
  return (await publish(target, 'direct')) === 'ok';
}
