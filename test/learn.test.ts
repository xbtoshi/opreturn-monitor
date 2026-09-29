import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { parseFrontMatter, renderMarkdown, resolveTokens, safeHref, slugId } from '../src/markdown';
import { CORE30, SPARROW } from '../src/facts';

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

  it('never repeats the retired Core 30 or Sparrow wording', () => {
    const banned = [CORE30.banned, SPARROW.banned, 'Tools → add an OP_RETURN', 'Tools → Add OP_RETURN'];
    const sources = [
      ...files.map((f) => readFileSync(new URL(f, dir), 'utf8')),
      readFileSync(new URL('../src/seo.ts', import.meta.url), 'utf8'),
      readFileSync(new URL('../src/ui.ts', import.meta.url), 'utf8'),
    ];
    for (const s of sources) for (const b of banned) expect(s.includes(b), `contains "${b}"`).toBe(false);
  });
});
