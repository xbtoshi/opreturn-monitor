/**
 * The category landing for "Bitcoin OP_RETURN explorer" queries.
 *
 * `/` stays the brand hub (The Permanent Record), `/feed` stays the product
 * surface, `/learn/op-return-api-for-agents` keeps API intent. This page
 * answers the explorer/search/messages intent and routes people to those.
 *
 * Copy lives in content/pages/bitcoin-op-return-explorer.md (same Markdown
 * subset and {{tokens}} as the Learn guides). This module only takes the
 * source string, so tests can load it without the Worker's .md import rule.
 */
import { escapeHtml, parseFrontMatter, renderMarkdown, resolveTokens, type FaqPair, type GuideDoc, type Heading } from './markdown';

export const EXPLORER_PATH = '/bitcoin-op-return-explorer';
/** The <title>; under 60 characters. The longer H1 comes from the front matter. */
export const EXPLORER_TITLE = 'Bitcoin OP_RETURN Explorer — Search On-Chain Messages';

export interface RenderedExplorer {
  doc: GuideDoc;
  /** The opening paragraph, rendered under the H1. */
  ledeHtml: string;
  bodyHtml: string;
  headings: Heading[];
  faq: FaqPair[];
  /** Fully resolved Markdown, for agents. */
  markdown: string;
}

export function parseExplorer(src: string): GuideDoc {
  return parseFrontMatter(EXPLORER_PATH.slice(1), src);
}

export function renderExplorer(doc: GuideDoc, facts: Record<string, string>): RenderedExplorer {
  const resolved = resolveTokens(doc.body, facts).replace(/^\s+/, '');
  const cut = resolved.indexOf('\n\n');
  const lede = cut < 0 ? resolved : resolved.slice(0, cut).replace(/\n/g, ' ');
  const rest = cut < 0 ? '' : resolved.slice(cut + 2);
  const ledeR = renderMarkdown(lede);
  const bodyR = renderMarkdown(rest);
  return {
    doc,
    ledeHtml: ledeR.html.replace(/^<p>|<\/p>$/g, ''),
    bodyHtml: bodyR.html,
    headings: bodyR.headings,
    faq: bodyR.faq,
    markdown: `# ${doc.meta.title}\n\n${resolved}\n\n## Start exploring\n\n- [Explore messages](/feed)\n- [Search OP_RETURN](/feed?q=) (add your words after q=)\n- [OP_RETURN API](/learn/op-return-api-for-agents)\n`,
  };
}

const CTAS = '<div class="cta"><a class="btn btn-primary" href="/feed">Explore messages →</a><a class="btn" href="#search">Search OP_RETURN</a><a class="btn" href="/learn/op-return-api-for-agents">OP_RETURN API</a></div>';

function searchForm(id: string): string {
  // A plain GET form: works without JavaScript and lands on the same /feed?q= view as the sidebar search.
  return `<form class="xsearch" action="/feed" method="get" role="search" id="${id}"><label class="slabel" for="${id}-q">SEARCH MESSAGE TEXT</label><div class="xsearch-row"><input id="${id}-q" name="q" type="search" placeholder="e.g. gm, satoshi, return the funds" autocomplete="off" spellcheck="false" required /><button class="btn btn-primary" type="submit">Search OP_RETURN</button></div><span class="xsearch-note">Search runs within the loaded feed messages, in your browser.</span></form>`;
}

/** The page body inside the app shell. data-learn lets the client reuse the Learn fetch-and-swap path. */
export function renderExplorerHtml(g: RenderedExplorer, related: Array<{ slug: string; title: string }>): string {
  const m = g.doc.meta;
  const slug = EXPLORER_PATH.slice(1);
  let h = `<main class="page article" data-learn="${escapeHtml(slug)}" data-title="${escapeHtml(EXPLORER_TITLE)}" data-description="${escapeHtml(m.description)}">`;
  h += '<nav class="crumbs"><a href="/">Home</a><span>/</span><span>Explorer</span></nav>';
  h += '<article class="art">';
  h += `<header class="art-head"><span class="kicker">◆ ${escapeHtml(m.kicker)}</span><h1 class="art-title">${escapeHtml(m.title)}</h1>`;
  h += `<p class="lede xlede">${g.ledeHtml}</p>`;
  h += CTAS;
  h += searchForm('search');
  h += '</header>';
  h += '<div class="art-grid">';
  h += `<div class="art-body">${g.bodyHtml}`;
  h += '<h2 id="start-exploring">Start exploring</h2>' + CTAS;
  if (related.length) {
    h += '<div class="art-related"><span class="slabel">RELATED GUIDES</span><ul>';
    for (const r of related) h += `<li><a href="/learn/${escapeHtml(r.slug)}">${escapeHtml(r.title)}</a></li>`;
    h += '</ul></div>';
  }
  h += '</div>';
  const toc = [...g.headings.filter((x) => x.level === 2), { level: 2 as const, id: 'start-exploring', text: 'Start exploring' }];
  h += '<aside class="art-toc"><span class="slabel">ON THIS PAGE</span><ol>';
  for (const t of toc) h += `<li><a href="#${t.id}">${escapeHtml(t.text)}</a></li>`;
  h += '</ol></aside>';
  h += '</div></article></main>';
  return h;
}

/**
 * WebPage + BreadcrumbList + WebApplication + FAQPage. No ratings, no counts,
 * no "#1" claims. No SearchAction: the only search is a client-side filter.
 */
export function explorerJsonLd(origin: string, g: RenderedExplorer): Array<Record<string, unknown>> {
  const url = origin + EXPLORER_PATH;
  const out: Array<Record<string, unknown>> = [
    {
      '@type': 'WebPage',
      '@id': url,
      url,
      name: EXPLORER_TITLE,
      headline: g.doc.meta.title,
      description: g.doc.meta.description,
      inLanguage: 'en',
      dateModified: g.doc.meta.updated,
      isPartOf: { '@id': `${origin}/#website` },
      about: { '@id': `${url}#app` },
      breadcrumb: { '@id': `${url}#breadcrumb` },
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${url}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
        { '@type': 'ListItem', position: 2, name: 'Bitcoin OP_RETURN Explorer', item: url },
      ],
    },
    {
      '@type': 'WebApplication',
      '@id': `${url}#app`,
      name: 'Bitcoin OP_RETURN Explorer — The Permanent Record',
      url,
      applicationCategory: 'BlockchainApplication',
      operatingSystem: 'All',
      description: 'Search and read Bitcoin OP_RETURN messages, decoded protocols and per-block census, with a free public API.',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    },
  ];
  if (g.faq.length) {
    out.push({
      '@type': 'FAQPage',
      '@id': `${url}#faq`,
      mainEntity: g.faq.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a.replace(/\*\*|`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') },
      })),
    });
  }
  return out;
}
