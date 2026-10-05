import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { EXPLORER_PATH, EXPLORER_TITLE, explorerJsonLd, parseExplorer, renderExplorer, renderExplorerHtml } from '../src/explorer';
import { buildWebSiteGraph, generateLlmsTxt, generateSitemapXml } from '../src/seo';

const src = readFileSync(new URL('../content/pages/bitcoin-op-return-explorer.md', import.meta.url), 'utf8');
const doc = parseExplorer(src);
const learnSlugs = new Set(
  ['coldcard-exploit-bulletin-board', 'bitcoin-core-30-op-return-datacarriersize', 'what-is-op-return', 'how-to-etch-op-return', 'op-return-vs-ordinals-vs-runes', 'reading-hack-negotiation-boards', 'prompt-injection-on-bitcoin', 'op-return-api-for-agents', 'dormant-wallet-op-return-notices', 'genesis-address-tributes']
);

describe('Bitcoin OP_RETURN explorer landing', () => {
  it('ships the brief\'s title, meta description and H1 within length limits', () => {
    expect(EXPLORER_PATH).toBe('/bitcoin-op-return-explorer');
    expect(EXPLORER_TITLE).toBe('Bitcoin OP_RETURN Explorer — Search On-Chain Messages');
    expect(EXPLORER_TITLE.length).toBeLessThan(60);
    expect(doc.meta.description.length).toBeLessThan(155);
    expect(doc.meta.title).toBe('Bitcoin OP_RETURN Explorer — Search & Read On-Chain Messages');
  });

  it('renders one H1, the claim-checked lede, three CTAs and a real search form', () => {
    const g = renderExplorer(doc, { 'chain:blocks': '1,234', protocols: '17' });
    const html = renderExplorerHtml(g, [{ slug: 'what-is-op-return', title: 'What is OP_RETURN' }]);
    expect(html.match(/<h1\b/g)?.length).toBe(1);
    expect(html).toContain('Search and explore Bitcoin OP_RETURN messages, protocols, and on-chain data.');
    expect(html).toContain('href="/feed">Explore messages');
    expect(html).toContain('href="#search">Search OP_RETURN');
    expect(html).toContain('href="/learn/op-return-api-for-agents">OP_RETURN API');
    expect(html).toMatch(/<form class="xsearch" action="\/feed" method="get" role="search" id="search">/);
    expect(html).toContain('name="q"');
    expect(html).toContain('1,234 blocks');
    expect(html).not.toContain('{{');
    expect(html).not.toContain('<script');
    expect(html).toContain('data-learn="bitcoin-op-return-explorer"');
  });

  it('never claims inscriptions, server-side search, or invented ratings', () => {
    const lower = src.toLowerCase();
    expect(lower).not.toMatch(/browse[^.]*inscriptions|explore[^.]*inscriptions/);
    expect(src).toContain('Does this index Ordinals inscriptions?');
    expect(src).toMatch(/no `q` parameter/);
    expect(lower).not.toMatch(/#1|best explorer|aggregaterating/);
    // The typo is mentioned once, in a visible FAQ, never in title/description/H1.
    expect(src.match(/OP_REUTRN/g)?.length).toBeLessThanOrEqual(2);
    expect(doc.meta.title + doc.meta.description).not.toContain('REUTRN');
  });

  it('has a real FAQ that becomes FAQPage structured data with plain-text answers', () => {
    const g = renderExplorer(doc, {});
    expect(g.faq.length).toBeGreaterThanOrEqual(6);
    expect(g.faq.map((f) => f.q)).toContain('Is the Bitcoin OP_RETURN API free? Do I need an API key?');
    const graph = explorerJsonLd('https://x.test', g);
    const types = graph.map((n) => n['@type']);
    expect(types).toEqual(['WebPage', 'BreadcrumbList', 'WebApplication', 'FAQPage']);
    expect(graph[0]['@id']).toBe('https://x.test/bitcoin-op-return-explorer');
    const faq = graph[3] as { mainEntity: Array<{ acceptedAnswer: { text: string } }> };
    for (const q of faq.mainEntity) expect(q.acceptedAnswer.text).not.toMatch(/\]\(|\*\*|`/);
    expect(JSON.stringify(graph)).not.toMatch(/aggregateRating|ratingValue/);
  });

  it('only links to real guides and safe paths, and uses tokens the facts loader supplies', () => {
    for (const r of doc.meta.related) expect(learnSlugs.has(r), r).toBe(true);
    for (const m of src.matchAll(/\]\(\/learn\/([a-z0-9-]+)\)/g)) expect(learnSlugs.has(m[1]), m[1]).toBe(true);
    for (const m of src.matchAll(/\]\(([^)]+)\)/g)) expect(m[1]).toMatch(/^(https:\/\/|\/|#)/);
    for (const m of src.matchAll(/\{\{([^}]+)\}\}/g)) expect(m[1]).toMatch(/^(date|tip|protocols|chain:(blocks|outputs|stored|runes_pct))$/);
  });

  it('serves agents a resolved Markdown twin with the start-exploring links', () => {
    const g = renderExplorer(doc, {});
    expect(g.markdown.startsWith('# Bitcoin OP_RETURN Explorer')).toBe(true);
    expect(g.markdown).toContain('[Explore messages](/feed)');
    expect(g.markdown).not.toContain('{{');
  });
});

describe('explorer discovery hooks', () => {
  it('is listed in the pages sitemap with its copy date, and in llms.txt', () => {
    const xml = generateSitemapXml('https://x.test', [], [], [], [], [], [], { today: '2026-10-05', landings: [{ path: EXPLORER_PATH, updated: '2026-10-05' }] });
    expect(xml).toContain('<loc>https://x.test/bitcoin-op-return-explorer</loc>\n    <lastmod>2026-10-05</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.9</priority>');
    expect(generateLlmsTxt('https://x.test')).toContain('https://x.test/bitcoin-op-return-explorer');
  });

  it('does not advertise a SearchAction for the client-side-only feed filter', () => {
    expect(JSON.stringify(buildWebSiteGraph('https://x.test'))).not.toContain('SearchAction');
  });

  it('escapes < in head JSON-LD so on-chain text cannot close the script tag', async () => {
    const { renderIndex } = await import('../src/ui');
    const html = renderIndex({ jsonLd: { '@type': 'Thing', name: '</script><script>alert(1)</script>' } });
    expect(html).not.toContain('</script><script>alert(1)');
    expect(html).toContain('\\u003c/script>');
  });
});
