import { Resvg } from '@cf-wasm/resvg';
import { FONT_BASE64 } from './font';
import type { CollectionWithStats, Message } from './types';

// ---------------------------------------------------------------------------
// OG card images: 1200x630 PNG, rasterized from a hand-built SVG with resvg-wasm.
// The design mirrors the site — paper, dotted grid, mono type, red diamond.
// ---------------------------------------------------------------------------

const CARD_W = 1200;
const CARD_H = 630;
const PAPER = '#e9e5d8';
const INK = '#16140d';
const MUTED = '#8a8676';
const SIG = '#d9481f';
const LINE = '#16140d';

let _fontCache: Uint8Array | null = null;
function fontBytes(): Uint8Array {
  if (!_fontCache) _fontCache = Uint8Array.from(atob(FONT_BASE64), (c) => c.charCodeAt(0));
  return _fontCache;
}

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Mono glyph advance ≈ 0.6em. */
function wrapText(text: string, maxChars: number): string[] {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxChars) {
      if (cur) lines.push(cur);
      cur = w;
    } else {
      cur = (cur + ' ' + w).trim();
    }
    if (cur.length > maxChars) {
      lines.push(cur.slice(0, maxChars - 1) + '\u2026');
      cur = '';
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : ['\u00a0'];
}

function midEllipsis(s: string, max: number): string {
  if (s.length <= max) return s;
  const keep = Math.max(6, Math.floor((max - 1) / 2));
  return s.slice(0, keep) + '\u2026' + s.slice(-keep);
}

function svgHeader(extra = ''): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">${extra}`;
}

function paperDefs(): string {
  return `<defs>
  <pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse">
    <circle cx="1" cy="1" r="1" fill="#d8d2c0"/>
  </pattern>
  <clipPath id="card"><rect x="0" y="0" width="${CARD_W}" height="${CARD_H}" rx="0"/></clipPath>
</defs>`;
}

function headerBar(): string {
  return `<rect x="0" y="0" width="${CARD_W}" height="630" fill="${PAPER}"/>
<rect x="0" y="0" width="${CARD_W}" height="630" fill="url(#dots)" opacity="0.6"/>
<text x="48" y="62" font-family="IBM Plex Mono, monospace" font-size="26" fill="${SIG}">&#9670;</text>
<text x="86" y="62" font-family="IBM Plex Mono, monospace" font-size="26" font-weight="600" fill="${INK}" letter-spacing="2">OP_RETURN · THE PERMANENT RECORD</text>
<text x="${CARD_W - 48}" y="62" text-anchor="end" font-family="IBM Plex Mono, monospace" font-size="24" fill="${MUTED}">opreturn.xyz</text>
<rect x="48" y="84" width="${CARD_W - 96}" height="3" fill="${LINE}"/>`;
}

function footerBar(colName: string, addr: string, likes: number, feeText: string): string {
  const likesTxt = likes > 0 ? `&#9829; ${likes}` : '';
  const right = [feeText, likesTxt].filter(Boolean).join('   ');
  return `<rect x="48" y="${CARD_H - 96}" width="${CARD_W - 96}" height="3" fill="${LINE}"/>
<text x="48" y="${CARD_H - 46}" font-family="IBM Plex Mono, monospace" font-size="24" fill="${SIG}" font-weight="600">${esc(colName) || 'UNTRACKED'}</text>
<text x="48" y="${CARD_H - 14}" font-family="IBM Plex Mono, monospace" font-size="22" fill="${MUTED}">${esc(midEllipsis(addr, 40))}</text>
${right ? `<text x="${CARD_W - 48}" y="${CARD_H - 30}" text-anchor="end" font-family="IBM Plex Mono, monospace" font-size="24" fill="${SIG}">${esc(right)}</text>` : ''}`;
}

export function messageCardSvg(msg: Message, colName: string): string {
  const raw = msg.content || '';
  const maxChars = 52;
  let fontSize = 40;
  let lines = wrapText(raw, maxChars);
  let lineHeight = fontSize * 1.55;
  while (lines.length * lineHeight > 400 && fontSize > 22) {
    fontSize -= 2;
    lineHeight = fontSize * 1.55;
    lines = wrapText(raw, Math.max(28, Math.floor(maxChars * (fontSize / 40))));
  }
  const tspan = lines
    .slice(0, 9)
    .map((l, i) => `<tspan x="110" dy="${i === 0 ? 0 : lineHeight}">${esc(l)}</tspan>`)
    .join('');
  const text = `<text x="110" y="270" font-family="IBM Plex Mono, monospace" font-size="${fontSize}" fill="${INK}">${tspan}</text>`;
  const caret = `<text x="60" y="270" font-family="IBM Plex Mono, monospace" font-size="${fontSize}" fill="${SIG}">&#9656;</text>`;
  const feeTxt = msg.fee_rate != null ? `${msg.fee_rate} sat/vB` : '';
  return svgHeader() + paperDefs() + headerBar() + caret + text + footerBar(colName, msg.address, msg.likes, feeTxt) + `</svg>`;
}

export function collectionCardSvg(col: CollectionWithStats): string {
  const lines = wrapText(col.description || col.name, 64).slice(0, 3);
  const tspan = lines.map((l, i) => `<tspan x="110" dy="${i === 0 ? 0 : 56}">${esc(l)}</tspan>`).join('');
  const text = `<text x="110" y="270" font-family="IBM Plex Mono, monospace" font-size="34" fill="${INK}">${tspan}</text>`;
  const title = `<text x="110" y="176" font-family="IBM Plex Mono, monospace" font-size="52" font-weight="600" fill="${INK}">${esc(col.name)}</text>`;
  const caret = `<text x="60" y="270" font-family="IBM Plex Mono, monospace" font-size="34" fill="${SIG}">&#9656;</text>`;
  const meta = `<text x="48" y="${CARD_H - 46}" font-family="IBM Plex Mono, monospace" font-size="24" fill="${SIG}" font-weight="600">ARCHIVE COLLECTION</text>
<text x="48" y="${CARD_H - 14}" font-family="IBM Plex Mono, monospace" font-size="22" fill="${MUTED}">${col.address_count} addresses · ${col.message_count} messages · opreturn.xyz</text>`;
  return svgHeader() + paperDefs() + headerBar() + title + caret + text + meta + `</svg>`;
}

export function categoryCardSvg(category: string, count: number): string {
  const lines = wrapText(category, 30).slice(0, 2);
  const tspan = lines.map((l, i) => `<tspan x="110" dy="${i === 0 ? 0 : 64}">${esc(l)}</tspan>`).join('');
  const title = `<text x="110" y="270" font-family="IBM Plex Mono, monospace" font-size="52" font-weight="600" fill="${INK}">${tspan}</text>`;
  const caret = `<text x="60" y="270" font-family="IBM Plex Mono, monospace" font-size="34" fill="${SIG}">&#9656;</text>`;
  const meta = `<text x="48" y="${CARD_H - 46}" font-family="IBM Plex Mono, monospace" font-size="24" fill="${SIG}" font-weight="600">CLASSIFIED TRANSMISSIONS</text>
<text x="48" y="${CARD_H - 14}" font-family="IBM Plex Mono, monospace" font-size="22" fill="${MUTED}">${count} messages archived · opreturn.xyz</text>`;
  return svgHeader() + paperDefs() + headerBar() + title + caret + meta + `</svg>`;
}

export function addressCardSvg(address: string): string {
  const addr = midEllipsis(address, 42);
  const text = `<text x="110" y="330" font-family="IBM Plex Mono, monospace" font-size="40" fill="${INK}">${esc(addr)}</text>`;
  const caret = `<text x="60" y="330" font-family="IBM Plex Mono, monospace" font-size="40" fill="${SIG}">&#9656;</text>`;
  const meta = `<text x="48" y="${CARD_H - 46}" font-family="IBM Plex Mono, monospace" font-size="24" fill="${SIG}" font-weight="600">ADDRESS RECORD</text>
<text x="48" y="${CARD_H - 14}" font-family="IBM Plex Mono, monospace" font-size="22" fill="${MUTED}">view on-chain · opreturn.xyz</text>`;
  return svgHeader() + paperDefs() + headerBar() + caret + text + meta + `</svg>`;
}

export function defaultCardSvg(): string {
  const tagline = wrapText(
    'People are leaving messages inside Bitcoin. Forever. Threats, confessions, prayers, ads, haiku \u2014 archived live from the chain.',
    52
  ).slice(0, 4);
  const tspan = tagline.map((l, i) => `<tspan x="110" dy="${i === 0 ? 0 : 54}">${esc(l)}</tspan>`).join('');
  const text = `<text x="110" y="330" font-family="IBM Plex Mono, monospace" font-size="34" fill="${INK}">${tspan}</text>`;
  const title = `<text x="110" y="236" font-family="IBM Plex Mono, monospace" font-size="58" font-weight="600" fill="${INK}">THE PERMANENT RECORD</text>`;
  const caret = `<text x="60" y="330" font-family="IBM Plex Mono, monospace" font-size="34" fill="${SIG}">&#9656;</text>`;
  const meta = `<text x="48" y="${CARD_H - 46}" font-family="IBM Plex Mono, monospace" font-size="24" fill="${SIG}" font-weight="600">OP_RETURN MONITOR</text>
<text x="48" y="${CARD_H - 14}" font-family="IBM Plex Mono, monospace" font-size="22" fill="${MUTED}">live from the chain · opreturn.xyz</text>`;
  return svgHeader() + paperDefs() + headerBar() + title + caret + text + meta + `</svg>`;
}

export async function svgToPng(svg: string): Promise<Uint8Array> {
  const resvg = await Resvg.async(svg, {
    fitTo: { mode: 'width', value: CARD_W },
    background: PAPER,
    font: { fontBuffers: [fontBytes()] },
  });
  return resvg.render().asPng();
}

export function pngResponse(png: Uint8Array): Response {
  return new Response(png, {
    status: 200,
    headers: {
      'content-type': 'image/png',
      'cache-control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
