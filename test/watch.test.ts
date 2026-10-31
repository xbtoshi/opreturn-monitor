import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { blockscoutClient } from '../src/evm';
import { formatUnits, isNtfyTopic, lineFor, toItem, watchEvmOutflows, type Watched } from '../src/watch';
import type { Env } from '../src/types';

// Trimmed live Blockscout v2 responses (31 October 2026): 0x5227's outgoing txs, token transfers
// (spam, 0-value WBTC and two priced tokens) and balance; internal items from the Uniswap router.
const fx = JSON.parse(readFileSync(new URL('./fixtures/blockscout-watch.json', import.meta.url), 'utf8'));
const A = '0x5227f603c1ee34ce3c06efe6477003bdfccb2f8c';
const TOPIC = 'Test_topic_0123456789abc';
const ETH = 10n ** 18n;
const wallets: Watched[] = [{ address: A, label: 'Exploiter 2' }];
const env = { DB: {} as D1Database, NTFY_TOPIC: TOPIC } as Env;

type Lists = { tx: any[]; tt: any[]; it: any[] };
const tx = (block: number, o: Record<string, unknown> = {}) => ({ block_number: block, hash: '0x' + block.toString(16).padStart(64, 'a'), from: { hash: A }, to: { hash: '0x' + 'b'.repeat(40) }, value: '0', fee: { type: 'actual', value: '100000000000000' }, method: 'transfer', status: 'ok', result: 'success', ...o });
const tt = (block: number, o: Record<string, unknown> = {}) => ({ block_number: block, log_index: 1, transaction_hash: '0x' + block.toString(16).padStart(64, 'c'), from: { hash: A }, to: { hash: '0x' + 'd'.repeat(40) }, token: { symbol: 'LINK', exchange_rate: '10', decimals: '18' }, total: { value: (5n * ETH).toString(), decimals: '18' }, ...o });
const itx = (block: number, o: Record<string, unknown> = {}) => ({ block_number: block, index: 1, transaction_hash: '0x' + block.toString(16).padStart(64, 'e'), from: { hash: A }, to: { hash: '0x' + 'f'.repeat(40) }, value: (9n * ETH / 10n).toString(), type: 'call', success: true, ...o });

/** A fake chain: lists newest first, 50 per page; `fail` makes a path answer 503 on every route. */
function world(init: Partial<Lists> = {}, balance = { wei: (12n * ETH / 10n).toString(), at: 100 }) {
  const w = { lists: { tx: [], tt: [], it: [], ...init } as Lists, balance: balance as { wei: string | null; at: number | null }, fail: new Set<string>(), sends: [] as { url: string; headers: Record<string, string>; body: string }[], sendStatus: [] as number[], urls: [] as string[], delegate: null as string | null, addr: null as Record<string, unknown> | null };
  const fetchFn = async (url: string, init?: RequestInit) => {
    w.urls.push(url);
    if (url.includes('ntfy.sh')) {
      w.sends.push({ url, headers: init!.headers as Record<string, string>, body: String(init!.body) });
      const s = w.sendStatus.shift() ?? 200;
      return new Response('{}', { status: s });
    }
    const u = new URL(url.replace(/^https:\/\/[^/]+\/proxy\//, ''));
    const kind = u.pathname.endsWith('/transactions') ? 'tx' : u.pathname.endsWith('/token-transfers') ? 'tt' : u.pathname.endsWith('/internal-transactions') ? 'it' : 'bal';
    if (w.fail.has('429')) return new Response('', { status: 429 });
    if (w.fail.has(`${kind}-page2-429`) && u.searchParams.get('offset') === '50') return new Response('', { status: 429 });
    if (w.fail.has(kind) || (w.fail.has(`${kind}-page2`) && u.searchParams.get('offset') === '50')) return new Response('', { status: 503 });
    if (kind === 'bal' && w.addr) return Response.json({ coin_balance: w.balance.wei, block_number_balance_updated_at: w.balance.at, ...w.addr });
    if (kind === 'bal') return Response.json({ coin_balance: w.balance.wei, block_number_balance_updated_at: w.balance.at, ...(w.delegate ? { proxy_type: 'eip7702', implementations: [{ address_hash: w.delegate }] } : { proxy_type: null }) });
    expect(u.searchParams.get('filter')).toBe('from');
    const all = w.lists[kind];
    const start = Number(u.searchParams.get('offset') || 0);
    const items = all.slice(start, start + 50);
    return Response.json({ items, next_page_params: start + 50 < all.length ? { offset: start + 50 } : null });
  };
  const state: Record<string, string> = {};
  let t = 1_800_000_000_000;
  const deps = { fetchFn, gapMs: 0, now: () => t, getState: async () => ({ ...state }), setState: async (k: string, v: string) => { state[k] = v; } };
  const run = (e: Env = env) => watchEvmOutflows(e, wallets, deps);
  return { w, state, run, tick: (ms: number) => (t += ms) };
}

describe('Blockscout fixtures (live shapes)', () => {
  it('reads outgoing txs with fee objects, and drops spam and 0-value token transfers', () => {
    const txs = fx.transactions_from.items.map((r: any) => toItem('tx', r, A));
    expect(txs.every((i: any) => i && i.fee > 0n && i.id.startsWith('tx:'))).toBe(true);
    const tts = fx.token_transfers_from.items.map((r: any) => toItem('tt', r, A)!);
    const counted = tts.filter((i: any) => i.counted).map((i: any) => i.symbol);
    expect(counted.sort()).toEqual(['CTSI', 'DAR']); // fake "ETH" (no price) and 0-value WBTC are out
    const it = toItem('it', fx.internal_from.items[0], fx.internal_from.items[0].from.hash.toLowerCase());
    expect(it?.id).toMatch(/^it:0x[0-9a-f]{64}:\d+$/);
    expect(typeof fx.address.coin_balance).toBe('string');
    expect(typeof fx.address.block_number_balance_updated_at).toBe('number');
  });

  it('formats amounts with BigInt, beyond 2^53 wei and with missing decimals', () => {
    expect(formatUnits(197_460_012_345_678_901_234_567n, 18)).toBe('197,460.0123');
    expect(formatUnits(5n * ETH, 18)).toBe('5');
    expect(lineFor(toItem('tt', tt(1, { total: { value: '42' }, token: { symbol: 'X', exchange_rate: '1' } }), A)!)).toBe('42 raw X → 0xdddd…dddd');
    expect(lineFor(toItem('tx', tx(1, { value: (3n * ETH / 2n).toString() }), A)!)).toBe('1.5 ETH → 0xbbbb…bbbb');
    expect(lineFor(toItem('tx', tx(1, { to: null, method: null }), A)!)).toBe('call unknown → new contract');
  });

  it('validates the ntfy topic', () => {
    expect(isNtfyTopic(TOPIC)).toBe(true);
    expect(isNtfyTopic('short')).toBe(false);
    expect(isNtfyTopic('has/slash/aaaaaaaaaaaa')).toBe(false);
  });
});

describe('watchEvmOutflows', () => {
  it('seeds silently, then alerts once for a new ETH send through the first relay', async () => {
    const { w, state, run } = world({ tx: [tx(90)] });
    const relayEnv = { ...env, EGRESS_RELAYS: 'relay1.test,relay2.test' } as Env;
    expect(await run(relayEnv)).toMatchObject({ alerts: 0, checked: 1, degraded: false });
    expect(w.sends).toHaveLength(0);
    w.lists.tx.unshift(tx(101, { value: (2n * ETH).toString() }));
    w.balance = { wei: (12n * ETH / 10n - 2n * ETH - 100000000000000n + 5n * ETH).toString(), at: 101 };
    expect(await run(relayEnv)).toMatchObject({ alerts: 1, items: 1 });
    expect(w.sends).toHaveLength(1);
    expect(w.sends[0].url).toBe(`https://relay1.test/proxy/https://ntfy.sh/${TOPIC}`);
    expect(w.sends[0].headers).toMatchObject({ Title: 'Hack wallet moved: Exploiter 2', Priority: '5', Click: `https://etherscan.io/tx/${tx(101).hash}` });
    expect(w.sends[0].body).toBe('2 ETH → 0xbbbb…bbbb');
    // same page again: nothing new
    await run(relayEnv);
    expect(w.sends).toHaveLength(1);
    expect(state['watch:' + A]).not.toContain(TOPIC);
    expect(state.watch_last_run).not.toContain(TOPIC);
  });

  it('a 0-value call is priority 3; a reverted tx is skipped but remembered', async () => {
    const { w, run } = world();
    await run();
    w.lists.tx.unshift(tx(102, { status: 'error', result: 'Reverted', value: (5n * ETH).toString() }), tx(101, { method: 'approve' }));
    await run();
    expect(w.sends).toHaveLength(1);
    expect(w.sends[0].headers.Priority).toBe('3');
    expect(w.sends[0].body).toBe('call approve → 0xbbbb…bbbb');
    await run();
    expect(w.sends).toHaveLength(1);
  });

  it('counts priced token transfers out, with a USD value, and ignores spam ones', async () => {
    const { w, run } = world();
    await run();
    w.lists.tt.unshift(tt(110, { log_index: 3 }), tt(110, { log_index: 2, token: { symbol: 'ETH', exchange_rate: null, decimals: '18' } }), tt(109, { total: { value: '0', decimals: '8' }, token: { symbol: 'WBTC', exchange_rate: '77317' } }));
    await run();
    expect(w.sends).toHaveLength(1);
    expect(w.sends[0].body).toBe('5 LINK (~$50) → 0xdddd…dddd');
    // the 0-value call that moved the token is folded into the token line
    w.lists.tx.unshift(tx(111));
    w.lists.tt.unshift(tt(111, { transaction_hash: tx(111).hash, total: { value: (2000n * ETH).toString(), decimals: '18' } }));
    await run();
    expect(w.sends[1].body).toBe('2,000 LINK (~$20,000) → 0xdddd…dddd');
    expect(w.sends[1].headers.Priority).toBe('5');
  });

  it('spam never alerts as movement; past three pages of it, a low-priority "busy" notice every time', async () => {
    const { w, run } = world();
    await run();
    w.lists.tt.unshift(...Array.from({ length: 40 }, (_, i) => tt(450, { log_index: i, token: { symbol: 'USDT', exchange_rate: null } })));
    await run();
    expect(w.sends).toHaveLength(0);
    const spam = Array.from({ length: 160 }, (_, i) => tt(700 - Math.floor(i / 2), { log_index: i, token: { symbol: 'USDT', exchange_rate: null } }));
    w.lists.tt.unshift(...spam);
    const r = await run();
    expect(r).toMatchObject({ truncated: 1, alerts: 1 });
    expect(w.sends.map((s) => [s.headers.Title, s.headers.Priority])).toEqual([['Hack wallet busy: Exploiter 2', '2']]);
    expect(w.sends[0].body).toContain(`https://etherscan.io/address/${A}`);
    w.lists.tt.unshift(...spam.map((x) => ({ ...x, block_number: x.block_number + 200 })));
    await run();
    expect(w.sends).toHaveLength(2);
    w.sends.length = 0;
    const base = 900;
    const flood = spam.map((x) => ({ ...x, block_number: x.block_number + base }));
    // and a real transfer on top of a flood alerts as movement, with the truncation note
    w.lists.tt.unshift(tt(2000), ...flood);
    await run();
    expect(w.sends).toHaveLength(1);
    expect(w.sends[0].body).toContain('5 LINK');
    expect(w.sends[0].body).toContain(`see https://etherscan.io/address/${A}`);
  });

  it('pages back while every item is new, and summarises past six lines', async () => {
    const { w, run, state } = world();
    await run();
    w.lists.tx.unshift(...Array.from({ length: 70 }, (_, i) => tx(300 - i, { value: ETH.toString() })));
    const r = await run();
    expect(r.truncated).toBe(0);
    expect(w.sends[0].body.split('\n')).toHaveLength(7);
    expect(w.sends[0].body).toMatch(/and 64 more$/);
    expect(JSON.parse(state['watch:' + A]).tx.block).toBe(300);
  });

  it('ignores pending items until they confirm, and a dropped item never alerts', async () => {
    const { w, run } = world({ tx: [tx(90)] });
    await run();
    w.lists.tx.unshift({ ...tx(0), block_number: null });
    await run();
    expect(w.sends).toHaveLength(0);
    w.lists.tx[0] = tx(120);
    await run();
    expect(w.sends).toHaveLength(1);
    w.lists.tx.shift(); // reorged out
    await run();
    expect(w.sends).toHaveLength(1);
  });

  it('each signal keeps its own cursor: one failing never hides another', async () => {
    const { w, run, state } = world();
    await run();
    w.fail.add('tx');
    w.lists.tx.unshift(tx(130, { method: 'approve' }));
    w.lists.tt.unshift(tt(140));
    await run();
    expect(w.sends).toHaveLength(1);
    expect(w.sends[0].body).toContain('LINK');
    expect(JSON.parse(state['watch:' + A]).tx.block).toBe(0);
    w.fail.delete('tx');
    await run();
    expect(w.sends).toHaveLength(2);
    expect(w.sends[1].body).toBe('call approve → 0xbbbb…bbbb'); // block 130 < token block 140, still caught
  });

  it('seeds each signal on its own, so a token outage leaves the rest armed', async () => {
    const { w, run, state } = world();
    w.fail.add('tt');
    const r = await run();
    expect(r.unseeded).toEqual(['0x5227…2f8c tt']);
    const s = JSON.parse(state['watch:' + A]);
    expect(s.tx).toBeDefined();
    expect(s.tt).toBeUndefined();
    w.lists.tx.unshift(tx(150, { value: ETH.toString() }));
    w.balance = { wei: (2n * ETH / 10n - 100000000000000n).toString(), at: 150 };
    await run();
    expect(w.sends).toHaveLength(1);
    expect(w.sends[0].body).toBe('1 ETH → 0xbbbb…bbbb'); // explained by its own tx: no balance line
  });

  it('catches an EIP-7702 sweep through internal transactions, even when an incoming transfer nets it out', async () => {
    const { w, run } = world();
    await run();
    w.lists.it.unshift(itx(160));
    // 0.9 out by delegated code, 0.9 in from elsewhere: the balance is unchanged
    await run();
    expect(w.sends).toHaveLength(1);
    expect(w.sends[0].body).toBe('0.9 ETH by contract code → 0xffff…ffff');
  });

  it('alerts on an unexplained balance drop (the backstop), but not on gas', async () => {
    const { w, run, state } = world();
    await run();
    w.balance = { wei: (12n * ETH / 10n - 3n * ETH / 10000n).toString(), at: 110 }; // 0.0003 ETH of gas
    await run();
    expect(w.sends).toHaveLength(0);
    w.balance = { wei: (3n * ETH / 10n).toString(), at: 120 }; // 0.9 ETH gone, nothing in the lists
    await run();
    expect(w.sends).toHaveLength(1);
    expect(w.sends[0].headers.Priority).toBe('5');
    expect(w.sends[0].body).toMatch(/^ETH balance fell 0\.8997 \(now 0\.3\), 0\.8997 not from its own transactions$/);
    expect(w.sends[0].headers.Click).toBe(`https://etherscan.io/address/${A}`);
    // a balance-only alert never moves the list cursors
    const s = JSON.parse(state['watch:' + A]);
    expect([s.tx.block, s.tt.block, s.it.block]).toEqual([0, 0, 0]);
  });

  it('a send alerted while the balance read lagged is not re-reported as a balance drop', async () => {
    const { w, run } = world();
    await run();
    w.fail.add('bal');
    w.lists.tx.unshift(tx(170, { value: ETH.toString() }));
    await run();
    expect(w.sends).toHaveLength(1);
    w.fail.delete('bal');
    w.balance = { wei: (2n * ETH / 10n - 100000000000000n).toString(), at: 171 };
    await run();
    expect(w.sends).toHaveLength(1);
  });

  it('a stale or null balance is ignored but kept, so a later fresh read still catches the drop', async () => {
    const { w, run, state } = world();
    await run();
    w.balance = { wei: null, at: null };
    expect(await run()).toMatchObject({ stale: 1, degraded: true });
    w.balance = { wei: '1', at: 50 }; // older than stored
    expect((await run()).stale).toBe(1);
    expect(JSON.parse(state['watch:' + A]).bal.at).toBe(100);
    w.balance = { wei: (1n * ETH / 10n).toString(), at: 130 };
    await run();
    expect(w.sends.filter((s) => s.headers.Title.startsWith('Hack wallet'))).toHaveLength(1);
  });

  it('a failed send keeps every cursor, so the next run sends again', async () => {
    const { w, run } = world();
    await run();
    w.lists.tx.unshift(tx(180, { value: ETH.toString() }));
    w.sendStatus.push(500);
    expect(await run()).toMatchObject({ alerts: 0, send_failed: 1 });
    await run();
    expect(w.sends.map((s) => s.body)).toEqual(['1 ETH → 0xbbbb…bbbb', '1 ETH → 0xbbbb…bbbb']);
  });

  it('falls back relay by relay, then direct', async () => {
    const { w, run } = world();
    const relayEnv = { ...env, EGRESS_RELAYS: 'relay1.test,relay2.test' } as Env;
    await run(relayEnv);
    w.lists.tx.unshift(tx(190, { value: ETH.toString() }));
    w.sendStatus.push(429, 503);
    await run(relayEnv);
    expect(w.sends.map((s) => s.url.split('/proxy/')[0])).toEqual(['https://relay1.test', 'https://relay2.test', `https://ntfy.sh/${TOPIC}`]);
  });

  it('says when the watch is degraded after three runs, at most every 6 h, and when it recovers', async () => {
    const { w, run, tick, state } = world();
    w.fail.add('bal');
    const titles = () => w.sends.map((s) => s.headers.Title);
    await run(); await run();
    expect(titles()).toEqual([]);
    await run();
    expect(titles()).toEqual(['Hack watch degraded']);
    expect(w.sends[0].body).toContain('0x5227…2f8c balance unread');
    expect(w.sends[0].headers.Priority).toBe('2');
    await run();
    expect(titles()).toHaveLength(1);
    tick(6 * 3600_000);
    await run();
    expect(titles()).toEqual(['Hack watch degraded', 'Hack watch degraded']);
    w.fail.delete('bal');
    await run();
    expect(titles()).toEqual(['Hack watch degraded', 'Hack watch degraded', 'Hack watch recovered']);
    await run();
    expect(titles()).toHaveLength(3);
    expect(JSON.parse(state.watch_health).streak).toBe(0);
  });

  it('stops at the deadline and reports it', async () => {
    let t = 0;
    let calls = 0;
    const r = await watchEvmOutflows(env, wallets, {
      gapMs: 0, getState: async () => ({}), setState: async () => undefined,
      now: () => t,
      fetchFn: async () => { calls++; t += 20_000; return Response.json({ items: [], next_page_params: null }); },
    });
    expect(calls).toBe(3); // 0, 20 and 40 s start; nothing starts at 60 s (deadline 60 s)
    expect(r.timed_out).toBe(true);
    expect(r.degraded).toBe(true);
  });

  it('does nothing when off or without a valid topic', async () => {
    const { w, run } = world();
    expect((await run({ ...env, WATCH_POLL: '0' } as Env)).skipped).toBe('off');
    expect((await run({ ...env, NTFY_TOPIC: 'bad topic' } as Env)).skipped).toBe('no topic');
    expect((await run({ ...env, NTFY_TOPIC: undefined } as Env)).skipped).toBe('no topic');
    expect(w.urls).toHaveLength(0);
  });

  it('trims a trailing slash from NTFY_BASE', async () => {
    const { w, run } = world();
    const e = { ...env, NTFY_BASE: 'https://ntfy.sh//' } as Env;
    await run(e);
    w.lists.tx.unshift(tx(200));
    await run(e);
    expect(w.sends[0].url).toBe(`https://ntfy.sh/${TOPIC}`);
  });
});

describe('blockscoutClient', () => {
  it('rotates relays per request, goes direct last, sends the API key and stops at the deadline', async () => {
    const urls: string[] = [];
    let t = 0;
    const c = blockscoutClient({ EGRESS_RELAYS: 'r1.test,r2.test', ETH_BLOCKSCOUT_API_KEY: 'k' } as Env, {
      gapMs: 0, deadline: 100, now: () => t,
      fetchFn: async (u) => { urls.push(u); t += 60; return u.startsWith('https://r1') ? new Response('', { status: 429 }) : Response.json({ ok: 1 }); },
    });
    expect(await c.get('/p', { a: 1 }, (b) => b)).toEqual({ ok: 1 });
    expect(urls).toEqual(['https://r1.test/proxy/https://eth.blockscout.com/p?a=1&apikey=k', 'https://r2.test/proxy/https://eth.blockscout.com/p?a=1&apikey=k']);
    expect(c.errors[0]).toContain('r1.test');
    expect(c.limited()).toBe(false); // r2 answered
    expect(await c.get('/q', null, (b) => b)).toBeNull(); // t = 120 ≥ deadline
    expect(c.timedOut()).toBe(true);
  });

  it('honours the gap between requests', async () => {
    const at: number[] = [];
    const c = blockscoutClient({} as Env, { gapMs: 30, fetchFn: async () => { at.push(Date.now()); return Response.json({}); } });
    await c.get('/a', null, (b) => b);
    await c.get('/b', null, (b) => b);
    expect(at[1] - at[0]).toBeGreaterThanOrEqual(25);
  });
});

describe('cron wiring', () => {
  it('passes labelled Ethereum addresses to the watch after the board poll, and cannot fail the run', () => {
    const src = readFileSync(new URL('../src/cron.ts', import.meta.url), 'utf8');
    expect(src).toContain("map((a) => ({ address: a.address, label: a.label }))");
    expect(src.indexOf("lap('evm')")).toBeLessThan(src.indexOf('watchEvmOutflows(env, watched).catch('));
    expect(src).toContain('watch_alerts: watch.alerts');
  });
});

describe('review fixes', () => {
  it('a failing later page fails the whole signal, so its older items still alert next run', async () => {
    const { w, run, state } = world();
    await run();
    w.lists.tx.unshift(...Array.from({ length: 60 }, (_, i) => tx(400 - i, { value: ETH.toString() })));
    w.fail.add('tx-page2');
    const r = await run();
    expect(r.request_failed).toBe(1);
    expect(w.sends).toHaveLength(0);
    expect(JSON.parse(state['watch:' + A]).tx.block).toBe(0);
    w.fail.delete('tx-page2');
    await run();
    expect(w.sends).toHaveLength(1);
    expect(w.sends[0].body).toMatch(/and 54 more$/); // all 60, none skipped
  });

  it('a pending item on top does not stop paging through new confirmed ones', async () => {
    const { w, run, state } = world();
    await run();
    w.lists.tx.unshift({ ...tx(0), block_number: null }, ...Array.from({ length: 70 }, (_, i) => tx(400 - i, { value: ETH.toString() })));
    await run();
    expect(w.sends[0].body).toMatch(/and 64 more$/);
    expect(JSON.parse(state['watch:' + A]).tx.block).toBe(400);
  });

  it('the live EIP-7702 shape: ETH sent by a delegated EOA\'s code shows up under its own internal transactions', async () => {
    const d = fx.internal_7702;
    const item = toItem('it', d.items[0], d.address)!;
    expect(item).toMatchObject({ kind: 'it', counted: true, value: 9n });
    expect(lineFor(item)).toMatch(/^0 ETH by contract code → 0x/); // 9 wei rounds to 0 at 4 places
  });

  it('alerts the moment a watched wallet delegates its code (EIP-7702), and when that is removed', async () => {
    const { w, run, state } = world();
    await run();
    w.delegate = fx.address_7702.implementations[0].address_hash;
    await run();
    expect(w.sends).toHaveLength(1);
    expect(w.sends[0].headers.Priority).toBe('5');
    expect(w.sends[0].body).toBe('Wallet code delegated (EIP-7702) to 0xe6b9…43ed: it can now be emptied without a transaction of its own');
    await run();
    expect(w.sends).toHaveLength(1);
    expect(JSON.parse(state['watch:' + A]).deleg).toBe(fx.address_7702.implementations[0].address_hash.toLowerCase());
    w.delegate = null;
    await run();
    expect(w.sends[1].body).toBe('EIP-7702 delegation removed');
    expect(w.sends[1].headers.Priority).toBe('3');
  });

  it('bounds attacker-controlled token metadata before BigInt math', () => {
    const huge = toItem('tt', tt(1, { total: { value: '1', decimals: '1000000000' }, token: { symbol: 'X', exchange_rate: '1', decimals: '1000000000' } }), A)!;
    expect(huge.decimals).toBeNull();
    expect(huge.usd).toBeUndefined();
    expect(lineFor(huge)).toBe('1 raw X → 0xdddd…dddd');
    const long = toItem('tt', tt(1, { total: { value: '9'.repeat(5000), decimals: '18' } }), A)!;
    expect(long.amount).toBe(0n);
    expect(long.counted).toBe(false);
    const fallback = toItem('tt', tt(1, { total: { value: '1500000', decimals: '' }, token: { symbol: 'USDC', exchange_rate: '1', decimals: '6' } }), A)!;
    expect(fallback.decimals).toBe(6);
    expect(lineFor(fallback)).toBe('1.5 USDC (~$2) → 0xdddd…dddd');
  });

  it('a send that does not go through, or every route rate-limited, counts as degraded', async () => {
    const { w, run } = world();
    await run();
    w.lists.tx.unshift(tx(500, { value: ETH.toString() }));
    w.sendStatus.push(400);
    expect(await run()).toMatchObject({ send_failed: 1, degraded: true });
    w.fail.add('429');
    expect((await run()).degraded).toBe(true);
  });

  it('delegation follows only fresh reads that carry the field, using the live address shape', async () => {
    const { w, run, state } = world();
    await run();
    const { coin_balance: _c, block_number_balance_updated_at: _b, ...shape } = fx.address_7702;
    w.addr = shape; // live proxy_type / implementations shape
    w.balance = { wei: w.balance.wei, at: 101 };
    await run();
    expect(w.sends[0].body).toMatch(/^Wallet code delegated \(EIP-7702\) to 0xe6b9…43ed/);
    w.addr = { proxy_type: null };
    w.balance = { wei: w.balance.wei, at: 90 }; // stale: older than stored
    await run();
    w.addr = {}; // fresh but no proxy_type field: unknown
    w.balance = { wei: w.balance.wei, at: 102 };
    await run();
    expect(w.sends).toHaveLength(1);
    expect(JSON.parse(state['watch:' + A]).deleg).toBe('0xe6b97aa1490c93c28a14d86c13c9dc9c950643ed');
    w.fail.add('bal');
    await run();
    expect(JSON.parse(state['watch:' + A]).deleg).toBe('0xe6b97aa1490c93c28a14d86c13c9dc9c950643ed');
    w.fail.delete('bal');
    w.addr = { proxy_type: null };
    w.balance = { wei: w.balance.wei, at: 103 };
    await run();
    expect(w.sends.map((s) => s.body)).toEqual([expect.stringMatching(/^Wallet code delegated/), 'EIP-7702 delegation removed']);
    w.addr = { proxy_type: 'eip7702', implementations: [] };
    w.balance = { wei: w.balance.wei, at: 104 };
    await run();
    expect(w.sends[2].body).toMatch(/to an unknown contract:/);
  });

  it('a delegated wallet on the first run alerts, together with any movement', async () => {
    const { w, run } = world();
    w.delegate = '0x' + '1'.repeat(40);
    await run();
    expect(w.sends).toHaveLength(1);
    expect(w.sends[0].headers.Priority).toBe('5');
    w.lists.it.unshift(itx(200));
    await run();
    expect(w.sends[1].body).toBe('0.9 ETH by contract code → 0xffff…ffff');
  });

  it('a page-2 429 on every route fails the signal and marks the run degraded', async () => {
    const { w, run, state } = world();
    await run();
    w.lists.tx.unshift(...Array.from({ length: 60 }, (_, i) => tx(400 - i)));
    w.fail.add('tx-page2-429');
    const r = await run();
    // every route 429 = rate-limited: the client stops, so the other three signals are unread too
    expect(r).toMatchObject({ request_failed: 4, degraded: true });
    expect(JSON.parse(state['watch:' + A]).tx.block).toBe(0);
    expect(w.sends).toHaveLength(0);
  });
});

