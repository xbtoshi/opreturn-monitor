/**
 * The Learn section: long-form guides written from the SEO/AEO briefs.
 *
 * Content lives in content/learn/*.md and is imported as text (see the
 * `rules` entry in wrangler.jsonc). Numbers in the prose are {{tokens}}
 * resolved from live site facts at render time so the guides never state a
 * stale or invented count.
 */
import * as db from './db';
import { escapeHtml, parseFrontMatter, readingMinutes, renderMarkdown, resolveTokens, type GuideDoc, type Heading, type FaqPair } from './markdown';

import coldcard from '../content/learn/coldcard-exploit-bulletin-board.md';
import core30 from '../content/learn/bitcoin-core-30-op-return-datacarriersize.md';
import whatIs from '../content/learn/what-is-op-return.md';
import howTo from '../content/learn/how-to-etch-op-return.md';
import versus from '../content/learn/op-return-vs-ordinals-vs-runes.md';
import boards from '../content/learn/reading-hack-negotiation-boards.md';
import injection from '../content/learn/prompt-injection-on-bitcoin.md';
import api from '../content/learn/op-return-api-for-agents.md';
import dormant from '../content/learn/dormant-wallet-op-return-notices.md';
import genesis from '../content/learn/genesis-address-tributes.md';

/** Explicit registry: slug → Markdown source. Order is the index order. */
export const GUIDE_SOURCES: Array<[string, string]> = [
  ['coldcard-exploit-bulletin-board', coldcard],
  ['bitcoin-core-30-op-return-datacarriersize', core30],
  ['what-is-op-return', whatIs],
  ['how-to-etch-op-return', howTo],
  ['op-return-vs-ordinals-vs-runes', versus],
  ['reading-hack-negotiation-boards', boards],
  ['prompt-injection-on-bitcoin', injection],
  ['op-return-api-for-agents', api],
  ['dormant-wallet-op-return-notices', dormant],
  ['genesis-address-tributes', genesis],
];

const DOCS = new Map<string, GuideDoc>(GUIDE_SOURCES.map(([slug, src]) => [slug, parseFrontMatter(slug, src)]));

export function listGuides(): GuideDoc[] {
  return GUIDE_SOURCES.map(([slug]) => DOCS.get(slug)!);
}

export function getGuide(slug: string): GuideDoc | null {
  return DOCS.get(slug) ?? null;
}

export function isGuideSlug(slug: string): boolean {
  return DOCS.has(slug);
}

// ---------------------------------------------------------------------------
// Live facts
// ---------------------------------------------------------------------------

export type Facts = Record<string, string>;

const fmt = (n: number) => n.toLocaleString('en-US');

/**
 * Collect every value a guide may reference. Awaited by the routes, so a
 * cold isolate never renders a blank number; on failure tokens fall back to
 * a neutral phrase (never zero).
 */
let factsCache: { at: number; facts: Facts } | null = null;

export async function loadFacts(d1: D1Database): Promise<Facts> {
  if (factsCache && Date.now() - factsCache.at < 60000) return factsCache.facts;
  const facts: Facts = { date: new Date().toISOString().slice(0, 10) };
  try {
    const [cols, chain, protocols] = await Promise.all([db.listCollections(d1), db.getChainStats(d1), db.listProtocols(d1)]);
    for (const c of cols) {
      const slug = c.slug || String(c.id);
      facts[`count:${slug}`] = fmt(c.message_count);
      facts[`addresses:${slug}`] = fmt(c.address_count);
    }
    if (chain.blocks > 0) {
      facts['chain:blocks'] = fmt(chain.blocks);
      facts['chain:outputs'] = fmt(chain.opreturn_outputs);
      facts['chain:stored'] = fmt(chain.stored_txs);
      facts['chain:runes_pct'] = chain.opreturn_outputs ? `${Math.round((chain.runes_outputs / chain.opreturn_outputs) * 100)}%` : '';
      if (chain.highest_height != null) facts.tip = fmt(chain.highest_height);
    }
    const decoded = protocols.filter((p) => p.protocol !== 'text').length;
    if (decoded) facts.protocols = String(decoded);
  } catch {
    // tokens fall back to neutral wording
  }
  factsCache = { at: Date.now(), facts };
  return facts;
}

/** Reading time is independent of live numbers, so compute it once per guide. */
const MINUTES = new Map<string, number>(GUIDE_SOURCES.map(([slug]) => [slug, readingMinutes(renderMarkdown(DOCS.get(slug)!.body).words)]));
export function guideMinutes(slug: string): number {
  return MINUTES.get(slug) ?? 1;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export interface RenderedGuide {
  doc: GuideDoc;
  /** Body HTML with the short answer removed (it is rendered separately). */
  bodyHtml: string;
  answerHtml: string;
  answerText: string;
  headings: Heading[];
  faq: FaqPair[];
  words: number;
  minutes: number;
  /** Fully resolved Markdown, for agents. */
  markdown: string;
}

function splitAnswer(body: string): { answer: string; rest: string } {
  const trimmed = body.replace(/^\s+/, '');
  const idx = trimmed.indexOf('\n\n');
  if (idx < 0) return { answer: trimmed, rest: '' };
  return { answer: trimmed.slice(0, idx).replace(/\n/g, ' '), rest: trimmed.slice(idx + 2) };
}

export function renderGuide(doc: GuideDoc, facts: Facts): RenderedGuide {
  const resolved = resolveTokens(doc.body, facts);
  const { answer, rest } = splitAnswer(resolved);
  const answerR = renderMarkdown(answer);
  const bodyR = renderMarkdown(rest);
  return {
    doc,
    bodyHtml: bodyR.html,
    answerHtml: answerR.html.replace(/^<p>|<\/p>$/g, ''),
    answerText: answer.replace(/\*\*|`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'),
    headings: bodyR.headings,
    faq: bodyR.faq,
    words: answerR.words + bodyR.words,
    minutes: readingMinutes(answerR.words + bodyR.words),
    markdown: `# ${doc.meta.title}\n\n${resolved}`,
  };
}

function dateHuman(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** The article page body (inside the app shell). */
export function renderGuideHtml(g: RenderedGuide, related: GuideDoc[]): string {
  const m = g.doc.meta;
  let h = `<main class="page article" data-learn="${escapeHtml(m.slug)}">`;
  h += '<nav class="crumbs"><a href="/learn">Learn</a><span>/</span><span>' + escapeHtml(m.kicker) + '</span></nav>';
  h += '<article class="art">';
  h += `<header class="art-head"><h1 class="art-title">${escapeHtml(m.title)}</h1>`;
  h += `<p class="art-meta"><time datetime="${escapeHtml(m.updated)}">Updated ${escapeHtml(dateHuman(m.updated))}</time> · ${g.minutes} min read · numbers on this page are read live from the archive</p></header>`;
  h += `<div class="answer"><span class="slabel">SHORT ANSWER</span><p>${g.answerHtml}</p></div>`;
  h += '<div class="art-grid">';
  h += `<div class="art-body">${g.bodyHtml}`;
  if (related.length) {
    h += '<div class="art-related"><span class="slabel">RELATED GUIDES</span><ul>';
    for (const r of related) h += `<li><a href="/learn/${escapeHtml(r.meta.slug)}">${escapeHtml(r.meta.title)}</a></li>`;
    h += '</ul></div>';
  }
  h += '<div class="cta" style="margin-top:28px"><a class="btn btn-primary" href="/feed">See the live feed →</a><a class="btn" href="/guide">Etch a message</a></div>';
  h += '</div>';
  const toc = g.headings.filter((x) => x.level === 2);
  if (toc.length) {
    h += '<aside class="art-toc"><span class="slabel">ON THIS PAGE</span><ol>';
    for (const t of toc) h += `<li><a href="#${t.id}">${escapeHtml(t.text)}</a></li>`;
    h += '</ol></aside>';
  }
  h += '</div></article></main>';
  return h;
}

export function renderLearnIndexHtml(guides: Array<{ doc: GuideDoc; minutes: number }>): string {
  let h = '<main class="page" data-learn="index">';
  h += '<div class="tt"><span class="kicker">LEARN</span><h1 class="title">Guides to Bitcoin’s OP_RETURN messages</h1>';
  h += '<p class="lede" style="max-width:70ch">Plain-language explainers written from the archive: what OP_RETURN is, what changed in Bitcoin Core 30, how to read the incident boards, how to etch a message of your own, and how to use the data as a developer or an agent. Every number in them is read live from the site.</p></div>';
  h += '<div class="table">';
  for (const { doc, minutes } of guides) {
    const m = doc.meta;
    h += `<a class="trow learn" href="/learn/${escapeHtml(m.slug)}"><span class="nm"><span class="code">${escapeHtml(m.kicker)}</span><b>${escapeHtml(m.title)}</b><span class="d">${escapeHtml(m.description)}</span></span><span class="cnt">${minutes} min</span></a>`;
  }
  h += '</div></main>';
  return h;
}

// ---------------------------------------------------------------------------
// Structured data
// ---------------------------------------------------------------------------

export function guideJsonLd(origin: string, g: RenderedGuide): Array<Record<string, unknown>> {
  const m = g.doc.meta;
  const url = `${origin}/learn/${m.slug}`;
  const out: Array<Record<string, unknown>> = [
    {
      '@type': 'Article',
      '@id': `${url}#article`,
      headline: m.title,
      description: m.description,
      datePublished: m.date,
      dateModified: m.updated,
      wordCount: g.words,
      inLanguage: 'en',
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      author: { '@type': 'Organization', name: 'The Permanent Record', url: origin },
      publisher: { '@type': 'Organization', name: 'The Permanent Record', url: origin },
      isPartOf: { '@type': 'WebSite', url: origin },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
        { '@type': 'ListItem', position: 2, name: 'Learn', item: `${origin}/learn` },
        { '@type': 'ListItem', position: 3, name: m.title, item: url },
      ],
    },
  ];
  if (g.faq.length) {
    out.push({
      '@type': 'FAQPage',
      '@id': `${url}#faq`,
      mainEntity: g.faq.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    });
  }
  return out;
}
