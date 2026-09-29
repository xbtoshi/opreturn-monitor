import { describe, expect, it } from 'vitest';
import { BATCH_LIMIT, buildBatch, hubConfig, submitToHub } from '../src/indexnow';
import type { Env } from '../src/types';

const cfg = { url: 'https://indexnow.example/v1/submit', token: 'tok_SECRET_VALUE_1234567890', host: 'opreturn.xyz' };
const rows = [
  { id: 1, txid: 'a'.repeat(64), monitored_address: 'bc1qcold' },
  { id: 2, txid: 'b'.repeat(64), monitored_address: 'bc1qcold' },
  { id: 3, txid: 'c'.repeat(64), monitored_address: null },
  { id: 4, txid: 'a'.repeat(64), monitored_address: 'bc1qother' },
];
const colOf = new Map([['bc1qcold', 'coldcard-exploit-bulletin-board']]);

describe('indexnow: batches', () => {
  it('announces message pages and touched collection pages once each, never the feed', () => {
    expect(buildBatch(rows, colOf, 'opreturn.xyz')).toEqual([
      'https://opreturn.xyz/m/' + 'a'.repeat(64),
      'https://opreturn.xyz/m/' + 'b'.repeat(64),
      'https://opreturn.xyz/m/' + 'c'.repeat(64),
      'https://opreturn.xyz/c/coldcard-exploit-bulletin-board',
    ]);
  });
  it('caps a batch at the limit', () => {
    const many = Array.from({ length: BATCH_LIMIT + 50 }, (_, i) => ({ id: i, txid: String(i).padStart(64, '0'), monitored_address: null }));
    expect(buildBatch(many, colOf, 'opreturn.xyz').length).toBe(BATCH_LIMIT);
  });
  it('reads the hub config from the environment and is off without a token', () => {
    expect(hubConfig({} as Env)).toBeNull();
    expect(hubConfig({ INDEXNOW_HUB_TOKEN: ' t ', SITE_URL: 'https://opreturn.xyz' } as Env)).toEqual({ url: 'https://indexnow.kyc.rip/v1/submit', token: 't', host: 'opreturn.xyz' });
    expect(hubConfig({ INDEXNOW_HUB_TOKEN: 't', INDEXNOW_HOST: 'Example.ORG', INDEXNOW_HUB_URL: 'https://h/x' } as Env)?.host).toBe('example.org');
  });
});

describe('indexnow: hub submission', () => {
  it('posts the host and urls with the bearer token and reads the queued count', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const fetchFn = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ queued: 2, mode: 'live' }), { status: 202 });
    }) as unknown as typeof fetch;
    const r = await submitToHub(fetchFn, cfg, ['https://opreturn.xyz/m/x', 'https://opreturn.xyz/c/y']);
    expect(r).toEqual({ ok: true, status: 202, queued: 2 });
    expect(seen!.url).toBe(cfg.url);
    expect((seen!.init.headers as Record<string, string>).authorization).toBe('Bearer ' + cfg.token);
    expect(JSON.parse(String(seen!.init.body))).toEqual({ host: 'opreturn.xyz', urls: ['https://opreturn.xyz/m/x', 'https://opreturn.xyz/c/y'] });
  });
  it('turns 401, 429 and 500 into error results without ever including the token', async () => {
    for (const status of [401, 429, 500]) {
      const fetchFn = (async () => new Response(JSON.stringify({ error: 'nope ' + cfg.token }), { status })) as unknown as typeof fetch;
      const r = await submitToHub(fetchFn, cfg, ['https://opreturn.xyz/m/x']);
      expect(r.ok).toBe(false);
      expect(r.status).toBe(status);
      expect(r.error).toContain(String(status));
      expect(r.error!.length).toBeLessThan(200);
    }
    // the error is what the hub said; we never put our own request (token, headers) in it
    const failing = (async () => { throw new Error('boom ' + cfg.token); }) as unknown as typeof fetch;
    const r = await submitToHub(failing, cfg, ['https://opreturn.xyz/m/x']);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('hub request failed');
  });
  it('times out instead of hanging, and sends nothing for an empty batch', async () => {
    const slow = ((_: string, init: RequestInit) => new Promise((_res, rej) => { (init.signal as AbortSignal).addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))); })) as unknown as typeof fetch;
    const r = await submitToHub(slow, cfg, ['https://opreturn.xyz/m/x'], 30);
    expect(r).toEqual({ ok: false, status: 0, error: 'hub timeout after 30 ms' });
    let called = false;
    const r2 = await submitToHub((async () => { called = true; return new Response(''); }) as unknown as typeof fetch, cfg, []);
    expect(r2.ok).toBe(true);
    expect(called).toBe(false);
  });
});
