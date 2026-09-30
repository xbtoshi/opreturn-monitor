import { describe, expect, it } from 'vitest';
import { generateMessagesSitemapXml, generateSitemapIndexXml, generateSitemapXml } from '../src/seo';
import type { Address, CollectionWithStats } from '../src/types';

const day = (s: string) => Math.floor(Date.parse(s + 'T12:00:00Z') / 1000);
const cols = [
  { id: 1, name: 'Coldcard Exploit Bulletin Board', slug: 'coldcard', description: '', created_at: '', address_count: 1, message_count: 5 },
  { id: 2, name: 'Empty Board', slug: 'empty', description: '', created_at: '', address_count: 1, message_count: 0 },
] as CollectionWithStats[];
const addrs = [
  { id: 1, address: 'bc1qcold', label: null, collection_id: 1, created_at: '' },
  { id: 2, address: 'bc1qempty', label: null, collection_id: 2, created_at: '' },
] as Address[];

function lastmods(xml: string): Map<string, string | null> {
  const m = new Map<string, string | null>();
  for (const block of xml.split('<url>').slice(1)) {
    const loc = /<loc>(.*?)<\/loc>/.exec(block)![1].replace('https://x.test', '');
    const lm = /<lastmod>(.*?)<\/lastmod>/.exec(block);
    m.set(loc, lm ? lm[1] : null);
  }
  return m;
}

describe('sitemap lastmod', () => {
  it('uses real activity dates and keeps today only for the pages that change every block', () => {
    const xml = generateSitemapXml(
      'https://x.test',
      cols,
      addrs,
      [{ txid: 'a'.repeat(64), block_time: day('2026-09-20'), created_at: '' }],
      [{ protocol: 'ico-20', last_ts: day('2026-09-25') }, { protocol: 'text', last_ts: day('2026-09-29') }],
      [{ tick: 'LEAF', last_ts: day('2026-09-24') }],
      [{ slug: 'what-is-op-return', updated: '2026-09-10' }],
      { today: '2026-09-30', categories: [{ category: 'Other', last_ts: day('2026-09-28') }], addressActivity: new Map([['bc1qcold', day('2026-09-27')]]) }
    );
    const lm = lastmods(xml);
    expect(lm.get('/')).toBe('2026-09-30');
    expect(lm.get('/feed')).toBe('2026-09-30');
    expect(lm.get('/rooms')).toBe('2026-09-30');
    expect(lm.get('/protocols')).toBe('2026-09-29');
    expect(lm.get('/collections')).toBe('2026-09-27');
    expect(lm.get('/guide')).toBe('2026-09-10');
    expect(lm.get('/learn/what-is-op-return')).toBe('2026-09-10');
    expect(lm.get('/c/coldcard')).toBe('2026-09-27');
    expect(lm.get('/c/coldcard/chat')).toBe('2026-09-27');
    expect(lm.get('/c/empty')).toBeNull();
    expect(lm.get('/cat/other')).toBe('2026-09-28');
    expect(lm.get('/cat/prompt-injection')).toBeNull();
    expect(lm.get('/p/ico-20')).toBe('2026-09-25');
    expect(lm.has('/p/text')).toBe(false);
    expect(lm.get('/tick/LEAF')).toBe('2026-09-24');
    expect(lm.get('/a/bc1qcold')).toBe('2026-09-27');
    expect(lm.get('/a/bc1qempty/chat')).toBeNull();
    expect(lm.get('/m/' + 'a'.repeat(64))).toBe('2026-09-20');
    // no guides -> no fabricated date on /guide and /learn
    const bare = lastmods(generateSitemapXml('https://x.test', [], [], [], [], [], [], { today: '2026-09-30' }));
    expect(bare.get('/guide')).toBeNull();
    expect(bare.get('/learn')).toBeNull();
    // only the three live pages carry today's date
    expect([...lm.entries()].filter(([, v]) => v === '2026-09-30').map(([k]) => k).sort()).toEqual(['/', '/feed', '/rooms']);
  });
});

describe('sitemap index and monthly message files', () => {
  it('lists the pages file and one file per non-empty month with the month\'s newest date', () => {
    const xml = generateSitemapIndexXml('https://x.test', [{ month: '2026-08', count: 12, last_ts: day('2026-08-30') }, { month: '2026-09', count: 0, last_ts: 0 }, { month: 'bogus', count: 3, last_ts: day('2026-09-01') }], '2026-09-30');
    const locs = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual(['https://x.test/sitemap-pages.xml', 'https://x.test/sitemap-messages-2026-08.xml']);
    expect(xml).toContain('<lastmod>2026-08-30</lastmod>');
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex')).toBe(true);
  });
  it('writes one URL per message with its block date, no duplicates, and the pages file carries no messages', () => {
    const rows = [{ txid: 'a'.repeat(64), ts: day('2026-08-02') }, { txid: 'b'.repeat(64), ts: day('2026-08-03') }, { txid: 'a'.repeat(64), ts: day('2026-08-02') }];
    const xml = generateMessagesSitemapXml('https://x.test', rows);
    expect((xml.match(/<url>/g) || []).length).toBe(2);
    expect(xml).toContain('<loc>https://x.test/m/' + 'b'.repeat(64) + '</loc>\n    <lastmod>2026-08-03</lastmod>');
    const pages = generateSitemapXml('https://x.test', cols, addrs, [], [], [], [], { today: '2026-09-30' });
    expect(pages).not.toContain('/m/');
  });
});
