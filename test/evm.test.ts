import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import FV, { type FeedView } from '../src/feedview.js';
import { evmText, isEvmAddress, normAddress, pollEvmAddresses, relayHosts, startCursor, toNewMessage, type BlockscoutPage } from '../src/evm';
import { insertMessageStatements, type NewMessage } from '../src/db';
import { buildMessageSchema, renderAddressMarkdown, renderMessageMarkdown } from '../src/seo';
import { messageCardSvg } from '../src/og';
import type { Env, Message } from '../src/types';

// Trimmed real Blockscout v2 response for Binance Hot Wallet Exploiter 2 (30 October 2026).
const fixture = JSON.parse(readFileSync(new URL('./fixtures/blockscout-exploiter2.json', import.meta.url), 'utf8')) as BlockscoutPage;
const WATCHED = '0x5227f603C1eE34CE3C06eFe6477003BDfCCB2f8c';
const hex = (s: string) => '0x' + Buffer.from(s, 'utf8').toString('hex');

describe('evmText', () => {
  it('keeps readable text in any script, emoji sequences included', () => {
    expect(evmText(hex('gm hacker'))).toBe('gm hacker');
    expect(evmText(hex('蓝V诚信互关'))).toBe('蓝V诚信互关');
    expect(evmText(hex('pls 👨‍👩‍👧‍👦👨‍👩‍👧‍👦👨‍👩‍👧‍👦 ❤️'))).toBe('pls 👨‍👩‍👧‍👦👨‍👩‍👧‍👦👨‍👩‍👧‍👦 ❤️');
    expect(evmText(hex('line one\nline two\ttab'))).toBe('line one\nline two\ttab');
    expect(evmText(hex('  padded \u0000\u0000\u0000'))).toBe('padded');
    expect(evmText(hex('\u200fمی\u200cخواهم'))).toBe('\u200fمی\u200cخواهم');
  });

  it('rejects calldata, binary, internal NULs, bad hex and oversized input', () => {
    // transfer(address,uint256): selector + two zero-padded words
    expect(evmText('0xa9059cbb000000000000000000000000' + '5227f603c1ee34ce3c06efe6477003bdfccb2f8c' + '0'.repeat(48) + '0de0b6b3a7640000')).toBeNull();
    expect(evmText(hex('hi\u0000there'))).toBeNull();
    expect(evmText('0xfffe')).toBeNull();
    expect(evmText('0xabc')).toBeNull();
    expect(evmText('0xzz')).toBeNull();
    expect(evmText('0x')).toBeNull();
    expect(evmText(null)).toBeNull();
    expect(evmText(hex('a'))).toBeNull();
    expect(evmText(hex('a'.repeat(8192)))).toBe('a'.repeat(8192));
    expect(evmText(hex('a'.repeat(8193)))).toBeNull();
  });
});

describe('Blockscout transaction → message row', () => {
  const rows = fixture.items.map((t) => toNewMessage(t, WATCHED));

  it('stores lowercase hashes and addresses, integer Unix seconds and no Bitcoin block height', () => {
    const r = rows[0]!;
    expect(r.txid).toBe(fixture.items[0].hash.toLowerCase());
    expect(r.txid).toMatch(/^0x[0-9a-f]{64}$/);
    expect(r.address).toBe(WATCHED.toLowerCase());
    expect(r.monitored_address).toBe(WATCHED.toLowerCase());
    expect(r.sender).toBe(fixture.items[0].from!.hash!.toLowerCase());
    expect(r.recipient).toBe(WATCHED.toLowerCase());
    expect(Number.isInteger(r.block_time)).toBe(true);
    expect(r.block_time).toBe(Math.floor(Date.parse(fixture.items[0].timestamp!) / 1000));
    expect(r.block_height).toBeNull();
    expect(r.protocol).toBe('text');
    expect(r.detail_tries).toBe(3);
    expect(r.content).toMatch(/^I am the person whose wallet you hacked/);
  });

  it('gives a repeated plea one content hash, so the existing dedupe folds it into one row', () => {
    const pleas = rows.filter((r) => r?.content?.startsWith('I am the person'));
    expect(pleas.length).toBe(3);
    expect(new Set(pleas.map((r) => r!.content_hash)).size).toBe(1);
    expect(new Set(pleas.map((r) => r!.txid)).size).toBe(3);
  });

  it('drops plain transfers, failed transactions and unparseable times', () => {
    expect(rows[rows.length - 1]).toBeNull(); // the wallet's own outgoing ETH transfer
    const t = fixture.items[0];
    expect(toNewMessage({ ...t, status: 'error' }, WATCHED)).toBeNull();
    expect(toNewMessage({ ...t, result: 'Reverted' }, WATCHED)).toBeNull();
    expect(toNewMessage({ ...t, timestamp: 'soon' }, WATCHED)).toBeNull();
    expect(toNewMessage({ ...t, hash: 'nothex' }, WATCHED)).toBeNull();
  });

  it('writes detail_tries in the INSERT so the mempool.space backfill never sees the row', () => {
    const binds: unknown[][] = [];
    const fake = { prepare: (sql: string) => ({ bind: (...a: unknown[]) => { binds.push([sql, ...a]); return {}; } }) } as unknown as D1Database;
    insertMessageStatements(fake, rows[0] as NewMessage);
    const [sql, ...args] = binds[0];
    expect(String(sql)).toContain('detail_tries)');
    expect(args[args.length - 1]).toBe(3);
    const btc = { ...(rows[0] as NewMessage), txid: 'a'.repeat(64), detail_tries: undefined };
    insertMessageStatements(fake, btc);
    expect(binds[1][binds[1].length - 1]).toBe(0);
    const src = readFileSync(new URL('../src/db.ts', import.meta.url), 'utf8');
    const detail = src.slice(src.indexOf('export async function listMessagesNeedingDetail'), src.indexOf('export async function listMessagesNeedingDetail') + 400);
    expect(detail).toContain("txid NOT LIKE '0x%'");
  });
});

describe('address casing', () => {
  it('recognises any-case Ethereum addresses and stores them lowercase', () => {
    expect(isEvmAddress(WATCHED)).toBe(true);
    expect(isEvmAddress('bc1qxyz')).toBe(false);
    expect(normAddress(WATCHED)).toBe(WATCHED.toLowerCase());
    expect(normAddress('bc1qABC')).toBe('bc1qABC');
  });

  it('seeds the Binance board lowercase, with four addresses and a sidebar-friendly name', () => {
    const cols = JSON.parse(readFileSync(new URL('../collections.json', import.meta.url), 'utf8')) as Array<{ name: string; slug: string; addresses: Array<{ address: string }> }>;
    const col = cols.find((c) => c.slug === 'binance-hack-ethereum-bulletin-board')!;
    expect(col.addresses.length).toBe(4);
    for (const a of col.addresses) expect(a.address).toMatch(/^0x[0-9a-f]{40}$/);
    expect(FV.shortCol({ name: col.name } as never)).toBe('Binance Hack (Ethereum)');
    // every other collection stays Bitcoin
    for (const c of cols.filter((x) => x !== col)) for (const a of c.addresses) expect(isEvmAddress(a.address)).toBe(false);
  });
});

describe('backfill cursor', () => {
  const newest: BlockscoutPage = { items: [], next_page_params: { index: 1 } };
  it('starts from the newest page, resumes a stored cursor, stops when done, and restarts on junk', () => {
    expect(startCursor(undefined, newest)).toEqual({ index: 1 });
    expect(startCursor('{"index":7}', newest)).toEqual({ index: 7 });
    expect(startCursor('done', newest)).toBe('done');
    expect(startCursor('{broken', newest)).toEqual({ index: 1 });
    expect(startCursor('[1]', newest)).toEqual({ index: 1 });
    expect(startCursor('{}', newest)).toEqual({ index: 1 });
    expect(startCursor(undefined, { items: [], next_page_params: null })).toBe('done');
  });
});

describe('pollEvmAddresses', () => {
  const env = { DB: {} as D1Database } as Env;
  const page = (next: Record<string, unknown> | null): Response => new Response(JSON.stringify({ ...fixture, next_page_params: next }), { status: 200 });

  it('walks the backlog, isolates a failing address and is idempotent on a re-poll', async () => {
    const stored = new Map<string, NewMessage>();
    const state: Record<string, string> = {};
    const urls: string[] = [];
    const fetchFn = async (url: string) => {
      urls.push(url);
      if (url.includes('0x8532')) throw new Error('boom');
      return url.includes('?') ? page(null) : page({ index: 174 });
    };
    const deps = {
      gapMs: 0,
      fetchFn,
      insert: async (r: NewMessage) => (stored.has(r.txid) ? false : (stored.set(r.txid, r), true)),
      known: async (txids: string[]) => new Set(txids.filter((x) => stored.has(x))),
      getState: async () => ({ ...state }),
      setState: async (k: string, v: string) => { state[k] = v; },
    };
    const addrs = [WATCHED, '0x8532FA14ACAf483729C449b8458aedDb900543D4'];
    const first = await pollEvmAddresses(env, addrs, deps);
    expect(first).toMatchObject({ inserted: 6, failed: 1, pages: 1 });
    expect(state['evm_backfill:' + WATCHED.toLowerCase()]).toBe('done');
    expect(urls[0]).toBe('https://eth.blockscout.com/api/v2/addresses/' + WATCHED.toLowerCase() + '/transactions');
    expect(urls.some((u) => u.endsWith('?index=174'))).toBe(true);
    let writes = 0;
    const again = await pollEvmAddresses(env, addrs, { ...deps, insert: async (r: NewMessage) => { writes++; return deps.insert(r); } });
    expect(again).toMatchObject({ inserted: 0, failed: 1, pages: 0 });
    // stored rows are skipped by one lookup, never re-written
    expect(writes).toBe(0);
    const run = JSON.parse(state.evm_last_run);
    expect(run).toMatchObject({ inserted: 0, failed: 1 });
    expect(run.errors[0]).toContain('boom');
  });

  it('skips a malformed item without losing the rest of the page', async () => {
    const body = { items: [null, { nope: 1 }, ...fixture.items], next_page_params: null };
    const res = await pollEvmAddresses(env, [WATCHED], {
      gapMs: 0,
      fetchFn: async () => new Response(JSON.stringify(body), { status: 200 }),
      insert: async () => true,
      known: async () => new Set<string>(),
      getState: async () => ({}),
      setState: async () => undefined,
    });
    expect(res).toMatchObject({ inserted: 6, failed: 0 });
  });

  it('does nothing when EVM_POLL is "0", and trims a trailing slash from the Blockscout URL', async () => {
    let calls = 0;
    const off = await pollEvmAddresses({ ...env, EVM_POLL: '0' }, [WATCHED], { fetchFn: async () => { calls++; return page(null); } });
    expect(off).toEqual({ inserted: 0, failed: 0 });
    expect(calls).toBe(0);
    const urls: string[] = [];
    await pollEvmAddresses({ ...env, ETH_BLOCKSCOUT_URL: 'https://bs.test///' }, [WATCHED], {
      gapMs: 0,
      fetchFn: async (u) => { urls.push(u); return page(null); },
      insert: async () => false,
      known: async () => new Set<string>(),
      getState: async () => ({ ['evm_backfill:' + WATCHED.toLowerCase()]: 'done' }),
      setState: async () => undefined,
    });
    expect(urls).toEqual(['https://bs.test/api/v2/addresses/' + WATCHED.toLowerCase() + '/transactions']);
  });

  it('stops the whole poll on a 429, fetching every newest page before any backlog', async () => {
    const urls: string[] = [];
    const state: Record<string, string> = {};
    const res = await pollEvmAddresses(env, [WATCHED, '0x8532FA14ACAf483729C449b8458aedDb900543D4', '0xc887aF690E0301CD4edBbCe8F8d31b4EC65B286A'], {
      gapMs: 0,
      fetchFn: async (u) => { urls.push(u); return u.includes('0x8532') ? new Response('slow down', { status: 429 }) : page({ index: 1 }); },
      insert: async () => true,
      known: async () => new Set<string>(),
      getState: async () => ({}),
      setState: async (k, v) => { state[k] = v; },
    });
    expect(urls.length).toBe(2); // 0x5227 newest, then 0x8532 → 429, nothing after
    expect(res).toMatchObject({ failed: 2, pages: 0 });
    expect(JSON.parse(state.evm_last_run)).toMatchObject({ rate_limited: true });
  });

  it('sends the optional API key and fetches newest pages before older ones', async () => {
    const urls: string[] = [];
    await pollEvmAddresses({ ...env, ETH_BLOCKSCOUT_API_KEY: 'k1' }, [WATCHED, '0xc887aF690E0301CD4edBbCe8F8d31b4EC65B286A'], {
      gapMs: 0,
      fetchFn: async (u) => { urls.push(u); return page(u.includes('index') ? null : { index: 9 }); },
      insert: async () => true,
      known: async () => new Set<string>(),
      getState: async () => ({}),
      setState: async () => undefined,
    });
    expect(urls.every((u) => u.includes('apikey=k1'))).toBe(true);
    expect(urls.map((u) => (u.includes('index=9') ? 'old' : 'new'))).toEqual(['new', 'new', 'old', 'old']);
  });

  it('goes through the egress relays first, rotating them, and falls back route by route', async () => {
    const relayEnv = { ...env, EGRESS_RELAYS: ' https://Relay1.test/ , relay2.test, not a host, ' } as Env;
    expect(relayHosts(relayEnv)).toEqual(['relay1.test', 'relay2.test']);
    const urls: string[] = [];
    const quiet = { gapMs: 0, insert: async () => true, known: async () => new Set<string>(), getState: async () => ({ ['evm_backfill:' + WATCHED.toLowerCase()]: 'done', 'evm_backfill:0xc887af690e0301cd4edbbce8f8d31b4ec65b286a': 'done' }), setState: async () => undefined };
    // relay1 is rate-limited, relay2 works
    await pollEvmAddresses(relayEnv, [WATCHED, '0xc887aF690E0301CD4edBbCe8F8d31b4EC65B286A'], {
      ...quiet,
      fetchFn: async (u) => { urls.push(u); return u.startsWith('https://relay1.test/') ? new Response('', { status: 429 }) : page(null); },
    });
    const target = 'https://eth.blockscout.com/api/v2/addresses/' + WATCHED.toLowerCase() + '/transactions';
    expect(urls[0]).toBe('https://relay1.test/proxy/' + target);
    expect(urls[1]).toBe('https://relay2.test/proxy/' + target);
    // second request starts on the next relay
    expect(urls[2]).toMatch(/^https:\/\/relay2\.test\/proxy\//);
    expect(urls.length).toBe(3);
  });

  it('marks the run rate-limited only when every route answers 429, and stops on a non-retryable status', async () => {
    const relayEnv = { ...env, EGRESS_RELAYS: 'relay1.test,relay2.test' } as Env;
    const state: Record<string, string> = {};
    const base = { gapMs: 0, insert: async () => true, known: async () => new Set<string>(), getState: async () => ({}), setState: async (k: string, v: string) => { state[k] = v; } };
    let urls: string[] = [];
    await pollEvmAddresses(relayEnv, [WATCHED], { ...base, fetchFn: async (u) => { urls.push(u); return u.includes('/proxy/') ? new Response('', { status: 429 }) : page(null); } });
    expect(urls.length).toBe(2 + 1); // two relays, then direct succeeds
    expect(JSON.parse(state.evm_last_run).rate_limited).toBe(false);
    urls = [];
    await pollEvmAddresses(relayEnv, [WATCHED, '0xc887aF690E0301CD4edBbCe8F8d31b4EC65B286A'], { ...base, fetchFn: async (u) => { urls.push(u); return new Response('', { status: 429 }); } });
    expect(urls.length).toBe(3); // every route 429 on the first address, then the run stops
    expect(JSON.parse(state.evm_last_run).rate_limited).toBe(true);
    urls = [];
    await pollEvmAddresses(relayEnv, [WATCHED], { ...base, fetchFn: async (u) => { urls.push(u); return new Response('', { status: 404 }); } });
    expect(urls.length).toBe(1); // a 404 is not a route problem
  });

  it('keeps Ethereum addresses out of the Bitcoin poll loop', () => {
    const src = readFileSync(new URL('../src/cron.ts', import.meta.url), 'utf8');
    expect(src).toContain('const addresses = all.filter((a) => !isEvmAddress(a.address));');
    expect(src).toContain('fetchAddressTxs(hosts, a.address)');
  });
});

// Rendering: Ethereum rows never link to Bitcoin pages or claim to be OP_RETURN.
const row = toNewMessage(fixture.items[3], WATCHED)!;
const evmMsg = { ...row, id: 900, likes: 2, dup_count: 1, is_mempool: 0, created_at: '2026-10-30 04:50:00', collection_id: 9, category: 'Other', is_dup: 0 } as unknown as Message;
const btcMsg = { id: 901, txid: 'a'.repeat(64), address: 'bc1qmonitored000000000000000', content: 'Hello', category: 'Other', protocol: 'text', likes: 0, dup_count: 1, is_mempool: 0, created_at: '', block_height: 969_100, block_time: 1_700_000_000, fee_rate: 3, fee_sats: 600, collection_id: 1 } as unknown as Message;
const cols = [
  { id: 1, name: 'Coldcard Exploit Bulletin Board', slug: 'coldcard-exploit-bulletin-board', chain: 'btc' as const },
  { id: 9, name: 'Binance Hack (Ethereum) Bulletin Board', slug: 'binance-hack-ethereum-bulletin-board', chain: 'eth' as const },
];
const view = (o: Partial<FeedView>): FeedView => ({ pathname: '/feed', search: '', sort: 'new', kind: 'text', q: '', feed: [], collections: cols, now: 1_761_800_000_000, ...o }) as FeedView;
const BITCOIN_ONLY = /\/block\/|mempool\.space|etched into Bitcoin|OP_RETURN output|ETCH A REPLY|sat\/vB/i;

describe('Ethereum rows render without Bitcoin claims', () => {
  it('feed row and message page link to Etherscan, not to Bitcoin blocks', () => {
    const r = FV.rowHTML(view({ feed: [evmMsg as never] }), evmMsg as never, 0);
    expect(r).toContain('href="https://etherscan.io/tx/' + row.txid + '"');
    expect(r).not.toMatch(BITCOIN_ONLY);
    const d = FV.detailHTML(view({ pathname: '/m/' + row.txid, detail: evmMsg as never, related: [] }) as never);
    expect(d).toContain('VIEW ON ETHERSCAN');
    expect(d).toContain('Sent as Ethereum transaction input data');
    expect(d).toContain('Ethereum · ');
    expect(d).not.toMatch(BITCOIN_ONLY);
    expect(d).not.toContain('>FEE<');
  });

  it('Bitcoin rows are unchanged', () => {
    const r = FV.rowHTML(view({ feed: [btcMsg as never] }), btcMsg as never, 0);
    expect(r).toContain('href="/block/969100"');
    const d = FV.detailHTML(view({ pathname: '/m/x', detail: btcMsg as never, related: [] }) as never);
    expect(d).toContain('VIEW ON MEMPOOL.SPACE');
    expect(d).toContain('Etched into the Bitcoin blockchain');
  });

  it('Ethereum chat rooms, empty or not, by collection or by address, drop the etch link and block wording', () => {
    const empty = { messages: [], participants: [], nextBefore: null };
    const full = { messages: [{ ...evmMsg, sender: '0xf3a0f9c2' + '0'.repeat(32) }], participants: [], nextBefore: null };
    for (const v of [
      view({ pathname: '/c/binance-hack-ethereum-bulletin-board/chat', filter: 9, chat: empty as never }),
      view({ pathname: '/c/binance-hack-ethereum-bulletin-board/chat', filter: 9, chat: full as never }),
      view({ pathname: '/a/' + row.address + '/chat', address: row.address, chat: full as never }),
    ]) {
      const h = FV.chatHTML(v);
      expect(h).toContain('Ethereum transactions confirm');
      expect(h).not.toMatch(BITCOIN_ONLY);
    }
    expect(FV.chatHTML(view({ pathname: '/c/coldcard-exploit-bulletin-board/chat', filter: 1, chat: empty as never }))).toContain('ETCH A REPLY');
  });

  it('the inlined client copy renders the Ethereum views identically', () => {
    const ui = readFileSync(new URL('../src/ui.ts', import.meta.url), 'utf8');
    const src = ui.slice(ui.indexOf('/*__FEEDVIEW_START__*/'), ui.indexOf('/*__FEEDVIEW_END__*/')).replace(/\\\$\{/g, '${').replace(/\\`/g, '`').replace(/\\\\/g, '\\');
    const clientFV = new Function(src + '\nreturn FV;')() as typeof FV;
    const v = view({ feed: [evmMsg as never, btcMsg as never] });
    expect(clientFV.feedHTML(v)).toBe(FV.feedHTML(v));
    const d = view({ pathname: '/m/' + row.txid, detail: evmMsg as never, related: [] });
    expect(clientFV.detailHTML(d as never)).toBe(FV.detailHTML(d as never));
    const c = view({ pathname: '/c/binance-hack-ethereum-bulletin-board/chat', filter: 9, chat: { messages: [], participants: [], nextBefore: null } as never });
    expect(clientFV.chatHTML(c)).toBe(FV.chatHTML(c));
  });

  it('Markdown, structured data and the share card are Ethereum-aware', () => {
    const md = renderMessageMarkdown('https://x.test', evmMsg, 'Binance Hack (Ethereum) Bulletin Board');
    expect(md).toMatch(/^# Ethereum Input-Data Message/);
    expect(md).toContain('https://etherscan.io/tx/' + row.txid);
    expect(md).not.toMatch(/mempool\.space|Bitcoin/);
    const amd = renderAddressMarkdown('https://x.test', row.address);
    expect(amd).toMatch(/^# Ethereum Address Record/);
    expect(amd).toContain('https://etherscan.io/address/' + row.address);
    expect(amd).not.toMatch(/mempool\.space|OP_RETURN/);
    const schema = buildMessageSchema('https://x.test', evmMsg);
    expect((schema.author as { url: string }).url).toBe('https://etherscan.io/address/' + row.sender);
    const blank = buildMessageSchema('https://x.test', { ...evmMsg, content: null } as Message);
    expect(blank.text).toBe('Ethereum input-data message');
    const svg = messageCardSvg(evmMsg, 'Binance Hack (Ethereum)');
    expect(svg).toContain('>ETHEREUM<');
    expect(svg).not.toContain('sat/vB');
    expect(messageCardSvg(btcMsg, 'Coldcard')).toContain('3 sat/vB');
  });
});
