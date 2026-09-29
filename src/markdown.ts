/**
 * Minimal, safe Markdown for the Learn section.
 *
 * Supports: front matter, h2/h3, paragraphs, bullet and numbered lists,
 * blockquotes, fenced code, pipe tables, **bold**, *em*, `code`, [links](),
 * and `{{tokens}}` resolved from live site facts. Everything is escaped
 * first; there is no raw-HTML pass-through, link schemes are whitelisted,
 * and heading ids are conservative slugs.
 */

export interface GuideMeta {
  slug: string;
  title: string;
  description: string;
  kicker: string;
  date: string;
  updated: string;
  related: string[];
  minWords: number;
}

export interface GuideDoc {
  meta: GuideMeta;
  body: string;
}

export interface Heading {
  level: 2 | 3;
  id: string;
  text: string;
}

export interface FaqPair {
  q: string;
  a: string;
}

export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Only http(s), mailto and site-relative paths survive; anything else becomes plain text. */
export function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (/^https?:\/\/[^\s"'<>]+$/i.test(href)) return href;
  if (/^mailto:[^\s"'<>]+$/i.test(href)) return href;
  if (/^\/(?!\/)[^\s"'<>]*$/.test(href)) return href;
  if (/^#[a-z0-9-]+$/.test(href)) return href;
  return null;
}

export function slugId(text: string, used: Set<string>): string {
  let base = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  if (!base) base = 'section';
  let id = base;
  let n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  used.add(id);
  return id;
}

export function parseFrontMatter(slug: string, src: string): GuideDoc {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(src);
  const meta: Record<string, string> = {};
  let body = src;
  if (m) {
    body = src.slice(m[0].length);
    for (const line of m[1].split('\n')) {
      const kv = /^([a-zA-Z_]+):\s*(.*)$/.exec(line);
      if (kv) meta[kv[1]] = kv[2].trim().replace(/^"(.*)"$/, '$1');
    }
  }
  return {
    meta: {
      slug,
      title: meta.title || slug,
      description: meta.description || '',
      kicker: meta.kicker || 'LEARN',
      date: meta.date || '',
      updated: meta.updated || meta.date || '',
      related: (meta.related || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      minWords: Number(meta.minWords) || 0,
    },
    body,
  };
}

/** Replace {{token}} placeholders. Unknown tokens fall back to a neutral phrase, never a zero. */
export function resolveTokens(body: string, facts: Record<string, string>): string {
  return body.replace(/\{\{([a-z_]+(?::[a-z0-9_-]+)?)\}\}/g, (_, key: string) => {
    const v = facts[key];
    return v == null || v === '' ? 'a growing number of' : v;
  });
}

function inline(text: string): string {
  // Escape first, then apply inline formatting on the escaped text.
  let s = escapeHtml(text);
  // code spans (no formatting inside)
  const codes: string[] = [];
  s = s.replace(/`([^`]+)`/g, (_, c: string) => {
    codes.push(`<code>${c}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  // links: [text](href)
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t: string, h: string) => {
    const href = safeHref(h.replace(/&amp;/g, '&'));
    if (!href) return t;
    const ext = /^https?:\/\//i.test(href) && !/^https?:\/\/opreturn\.xyz(\/|$)/i.test(href);
    return `<a href="${escapeHtml(href)}"${ext ? ' target="_blank" rel="noopener"' : ''}>${t}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?=[^*\w]|$)/g, '$1<em>$2</em>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => codes[Number(i)]);
  return s;
}

export interface Rendered {
  html: string;
  headings: Heading[];
  faq: FaqPair[];
  words: number;
}

/** Render the Markdown subset to HTML. FAQ pairs are the h3/paragraph pairs under an "FAQ" h2. */
export function renderMarkdown(body: string): Rendered {
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  const headings: Heading[] = [];
  const faq: FaqPair[] = [];
  const used = new Set<string>();
  let words = 0;
  let inFaq = false;
  let faqQ: string | null = null;
  let para: string[] = [];
  let list: { type: 'ul' | 'ol'; items: string[] } | null = null;

  const countWords = (t: string) => {
    words += t.split(/\s+/).filter(Boolean).length;
  };
  const flushPara = () => {
    if (!para.length) return;
    const text = para.join(' ');
    countWords(text);
    out.push(`<p>${inline(text)}</p>`);
    if (inFaq && faqQ) {
      faq.push({ q: faqQ, a: text });
      faqQ = null;
    }
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    out.push(`<${list.type}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.type}>`);
    list = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^```/.test(line)) {
      flushPara();
      flushList();
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }
    const h = /^(##|###)\s+(.+?)\s*#*$/.exec(line);
    if (h) {
      flushPara();
      flushList();
      const level = h[1].length as 2 | 3;
      const text = h[2].trim();
      const id = slugId(text, used);
      headings.push({ level, id, text });
      countWords(text);
      if (level === 2) {
        inFaq = /^faq\b/i.test(text) || /frequently asked/i.test(text);
        faqQ = null;
      } else if (inFaq) {
        faqQ = text;
      }
      out.push(`<h${level} id="${id}">${inline(text)}</h${level}>`);
      continue;
    }
    if (/^\|/.test(line) && i + 1 < lines.length && /^\|?\s*:?-{2,}/.test(lines[i + 1])) {
      flushPara();
      flushList();
      const cells = (l: string) =>
        l
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(cells(lines[i++]));
      i--;
      out.push(
        `<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
          .join('')}</tbody></table>`
      );
      rows.forEach((r) => countWords(r.join(' ')));
      countWords(head.join(' '));
      continue;
    }
    const li = /^(\s*)([-*]|\d+\.)\s+(.+)$/.exec(line);
    if (li) {
      flushPara();
      const type = /\d/.test(li[2]) ? 'ol' : 'ul';
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [] };
      }
      list.items.push(li[3]);
      countWords(li[3]);
      continue;
    }
    if (/^>\s?/.test(line)) {
      flushPara();
      flushList();
      const quote: string[] = [line.replace(/^>\s?/, '')];
      while (i + 1 < lines.length && /^>\s?/.test(lines[i + 1])) quote.push(lines[++i].replace(/^>\s?/, ''));
      const text = quote.join(' ');
      countWords(text);
      out.push(`<blockquote><p>${inline(text)}</p></blockquote>`);
      continue;
    }
    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }
    if (list && /^\s{2,}\S/.test(line)) {
      list.items[list.items.length - 1] += ' ' + line.trim();
      countWords(line);
      continue;
    }
    flushList();
    para.push(line.trim());
  }
  flushPara();
  flushList();
  return { html: out.join('\n'), headings, faq, words };
}

/** Rough reading time in minutes at 220 wpm. */
export function readingMinutes(words: number): number {
  return Math.max(1, Math.round(words / 220));
}
