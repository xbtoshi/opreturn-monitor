import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { parseFrontMatter, renderMarkdown, resolveTokens, safeHref, slugId } from '../src/markdown';
import { CORE30, SPARROW } from '../src/facts';
import { CATEGORIES } from '../src/classify';

const dir = new URL('../content/learn/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.md')).sort();

describe('markdown renderer', () => {
  it('renders headings, lists, tables, code, quotes and inline formatting', () => {
    const r = renderMarkdown(
      '## Heading one\n\nA **bold** and *em* and `code` line with a [link](/feed).\n\n- one\n- two\n\n1. first\n2. second\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n```\nraw <code>\n```\n\n> quoted\n\n### Sub\n\ntext'
    );
    expect(r.html).toContain('<h2 id="heading-one">Heading one</h2>');
    expect(r.html).toContain('<strong>bold</strong>');
    expect(r.html).toContain('<em>em</em>');
    expect(r.html).toContain('<code>code</code>');
    expect(r.html).toContain('<a href="/feed">link</a>');
    expect(r.html).toContain('<ul><li>one</li><li>two</li></ul>');
    expect(r.html).toContain('<ol><li>first</li><li>second</li></ol>');
    expect(r.html).toContain('<table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>');
    expect(r.html).toContain('<pre><code>raw &lt;code&gt;</code></pre>');
    expect(r.html).toContain('<blockquote><p>quoted</p></blockquote>');
    expect(r.headings.map((h) => h.id)).toEqual(['heading-one', 'sub']);
  });

  it('escapes HTML and rejects unsafe link schemes', () => {
    const r = renderMarkdown('<script>alert(1)</script> [x](javascript:alert(1)) [y](data:text/html,hi) [z](//evil.com) [ok](https://example.com/a?b=1&c=2) <img onerror=x>');
    expect(r.html).not.toContain('<script');
    expect(r.html).not.toContain('javascript:');
    expect(r.html).not.toContain('data:text');
    expect(r.html).not.toContain('href="//');
    expect(r.html).toContain('href="https://example.com/a?b=1&amp;c=2" target="_blank" rel="noopener"');
    expect(r.html).toContain('&lt;img onerror=x&gt;');
    expect(safeHref('vbscript:x')).toBeNull();
    expect(safeHref('/learn/x')).toBe('/learn/x');
    expect(safeHref('mailto:a@b.c')).toBe('mailto:a@b.c');
  });

  it('keeps heading ids conservative and unique, even with attribute-breaking text', () => {
    const used = new Set<string>();
    expect(slugId('Hello "World" <b>', used)).toBe('hello-world-b');
    expect(slugId('Hello World b', used)).toBe('hello-world-b-2');
    const r = renderMarkdown('## A "quoted" heading\n\ntext');
    expect(r.html).toContain('<h2 id="a-quoted-heading">A &quot;quoted&quot; heading</h2>');
  });

  it('extracts FAQ pairs from h3 + paragraph under an FAQ h2', () => {
    const r = renderMarkdown('## Intro\n\nx\n\n## FAQ\n\n### Q one?\n\nA one.\n\n### Q two?\n\nA two.\n\n## Sources\n\n- s');
    expect(r.faq).toEqual([
      { q: 'Q one?', a: 'A one.' },
      { q: 'Q two?', a: 'A two.' },
    ]);
  });

  it('resolves tokens and never leaks a zero for a missing fact', () => {
    expect(resolveTokens('{{count:x}} messages, {{chain:blocks}} blocks', { 'count:x': '59' })).toBe('59 messages, a growing number of blocks');
  });
});

describe('landing SSR', () => {
  it('renders the same section skeleton the client builds, with the first FAQ open', async () => {
    const { renderLandingSsr, timeAgo } = await import('../src/seo');
    const now = Math.floor(Date.now() / 1000);
    const msg = { id: 1, txid: 'a'.repeat(64), address: 'bc1qxyz', content: 'Hello, Blockchain!', category: 'Graffiti / Greetings', likes: 3, is_mempool: 0, created_at: '', block_time: now - 240, raw_hex: null, fee_sats: null, fee_rate: null, collection_id: null } as never;
    const html = renderLandingSsr({
      collectionsCount: 8, addressesCount: 32, messagesCount: 100, featured: msg, live: [msg],
      chain: { blocks: 10, lowest_height: 1, highest_height: 10, opreturn_outputs: 200, runes_outputs: 150, binary_outputs: 0, stored_txs: 50 },
      protocolsCount: 4, categories: [{ category: 'Other', count: 3 }, { category: 'Threats / Hostility', count: 1 }],
    });
    const order = ['<main data-ssr="about">', 'class="hero"', 'class="livepanel"', 'data-ts="', 'class="about-sec"', 'class="stats"', 'class="about-grid"', 'class="featured"', 'class="chart"', 'class="faq"', 'class="faq-item open"'];
    let pos = -1;
    for (const needle of order) { const i = html.indexOf(needle, pos + 1); expect(i, needle).toBeGreaterThan(pos); pos = i; }
    expect(html).toContain('50 OP_RETURN TXS DECODED');
    // the contact block closes the page, after the FAQ, with the maintainer's profile as a rel=me link
    const contact = html.indexOf('<div class="about-sec" id="contact">');
    expect(contact).toBeGreaterThan(html.indexOf('class="faq-item open"'));
    expect(html.slice(contact)).toContain('href="https://x.com/xbtoshi" rel="me noopener" target="_blank">@xbtoshi</a>');
    expect(html.slice(contact)).toContain('data-action="suggest-open"');
    expect(html.slice(contact)).toContain('href="https://github.com/xbtoshi/opreturn-monitor" rel="me noopener" target="_blank">Source on GitHub');
    expect(html.endsWith('</div></main>')).toBe(true);
    expect(html).toContain('75%');
    expect(html).toContain('4m ago');
    expect(html).not.toContain('<script');
    expect(timeAgo(now - 3700)).toBe('1h ago');
  });
});

const llmsHas = (txt: string, needle: string) => txt.includes(needle);

describe('site graph and llms.txt', () => {
  it('links the maintainer profile from exactly one Organization node and from llms.txt', async () => {
    const { buildWebSiteGraph, generateLlmsTxt } = await import('../src/seo');
    const graph = buildWebSiteGraph('https://x.test');
    const orgs: Array<Record<string, unknown>> = [];
    const walk = (v: unknown) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') { const o = v as Record<string, unknown>; if (o['@type'] === 'Organization') orgs.push(o); Object.values(o).forEach(walk); } };
    walk(graph);
    expect(orgs.length).toBeGreaterThan(0);
    expect(orgs.filter((o) => Array.isArray(o.sameAs) && (o.sameAs as string[]).includes('https://x.com/xbtoshi')).length).toBe(1);
    expect(orgs.find((o) => Array.isArray(o.sameAs))?.sameAs).toEqual(['https://x.com/xbtoshi', 'https://github.com/xbtoshi/opreturn-monitor']);
    expect(llmsHas(generateLlmsTxt('https://x.test'), 'https://github.com/xbtoshi/opreturn-monitor')).toBe(true);
    const llms = generateLlmsTxt('https://x.test');
    expect(llms).toContain('## Contact');
    expect(llms).toContain('@xbtoshi on X (https://x.com/xbtoshi)');
  });
});

describe('learn content', () => {
  it('has ten guides with complete front matter', () => {
    expect(files.length).toBe(10);
    for (const f of files) {
      const doc = parseFrontMatter(f.replace(/\.md$/, ''), readFileSync(new URL(f, dir), 'utf8'));
      expect(doc.meta.title.length, f).toBeGreaterThan(20);
      expect(doc.meta.description.length, f).toBeGreaterThan(60);
      expect(doc.meta.date, f).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(doc.meta.minWords, f).toBeGreaterThan(0);
    }
  });

  it('meets each brief\'s minimum length after stripping front matter and tokens', () => {
    for (const f of files) {
      const doc = parseFrontMatter(f, readFileSync(new URL(f, dir), 'utf8'));
      const r = renderMarkdown(resolveTokens(doc.body, {}));
      expect(r.words, `${f}: ${r.words} words`).toBeGreaterThanOrEqual(doc.meta.minWords);
      expect(r.faq.length, `${f} faq`).toBeGreaterThanOrEqual(4);
    }
  });

  it('only uses tokens the facts loader can supply, and only relative or https links', () => {
    const allowed = /^(date|tip|protocols|chain:(blocks|outputs|stored|runes_pct)|count:[a-z0-9-]+|addresses:[a-z0-9-]+)$/;
    for (const f of files) {
      const src = readFileSync(new URL(f, dir), 'utf8');
      for (const m of src.matchAll(/\{\{([^}]+)\}\}/g)) expect(m[1], `${f} token ${m[1]}`).toMatch(allowed);
      for (const m of src.matchAll(/\]\(([^)]+)\)/g)) expect(m[1], `${f} link ${m[1]}`).toMatch(/^(https:\/\/|\/|#)/);
    }
  });

  it('rejects attribute injection through links, headings, tables and code', () => {
    const r = renderMarkdown('[x](https://a.com"onmouseover=alert(1)) [y](https://b.com/<img>) | `<b>` |\n## "><script>x</script>\n\n| h"><i> | 2 |\n| --- | --- |\n| `<x>` | [z](javascript:1) |');
    expect(r.html).not.toMatch(/onmouseover|<script|<img|<i>|<b>|<x>/);
    expect(r.html).not.toContain('javascript:');
    expect(safeHref('https://a.com"onmouseover=alert(1)')).toBeNull();
  });

  it('every related slug and internal /learn link points at a real guide', () => {
    const slugs = new Set(files.map((f) => f.replace(/\.md$/, '')));
    for (const f of files) {
      const src = readFileSync(new URL(f, dir), 'utf8');
      const doc = parseFrontMatter(f, src);
      for (const r of doc.meta.related) expect(slugs.has(r), `${f} related ${r}`).toBe(true);
      for (const m of src.matchAll(/\]\(\/learn\/([a-z0-9-]+)\)/g)) expect(slugs.has(m[1]), `${f} link ${m[1]}`).toBe(true);
    }
  });

  it('states the current category count wherever a count is written out', () => {
    const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
    const word = words[CATEGORIES.length];
    const sources = [
      ...files.map((f) => readFileSync(new URL(f, dir), 'utf8')),
      readFileSync(new URL('../src/ui.ts', import.meta.url), 'utf8'),
      readFileSync(new URL('../README.md', import.meta.url), 'utf8'),
    ];
    for (const s of sources) {
      for (const m of s.matchAll(/\b([a-z]+) (categories|classifier categories|category names)\b/gi)) {
        if (words.includes(m[1].toLowerCase())) expect(m[1].toLowerCase(), m[0]).toBe(word);
      }
    }
  });

  it('never repeats the retired Core 30 or Sparrow wording, nor the old seven-category count', () => {
    const banned = [CORE30.banned, SPARROW.banned, 'Tools → add an OP_RETURN', 'Tools → Add OP_RETURN', 'seven categor', 'seven classifier', 'seven discrete', 'seven category names'];
    const sources = [
      ...files.map((f) => readFileSync(new URL(f, dir), 'utf8')),
      readFileSync(new URL('../src/seo.ts', import.meta.url), 'utf8'),
      readFileSync(new URL('../src/ui.ts', import.meta.url), 'utf8'),
    ];
    for (const s of sources) for (const b of banned) expect(s.includes(b), `contains "${b}"`).toBe(false);
  });
});
