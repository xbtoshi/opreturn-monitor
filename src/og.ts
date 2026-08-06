import { Resvg } from '@cf-wasm/resvg';
import { FONT_BASE64 } from './font';
import type { CollectionWithStats, Message } from './types';

// ---------------------------------------------------------------------------
// OG card images: 1200x630 PNG, rasterized from a hand-built SVG with resvg-wasm.
// The design mirrors the site — paper, dotted grid, IBM Plex Mono, red accents.
//
// Everything decorative (diamond, heart, status dot, blockquote bar) is drawn as
// an SVG *shape*, never a font glyph, so nothing depends on a symbol existing in
// the single embedded font buffer. Body text is fit-to-box: the font shrinks
// until the copy fits both the width budget and the vertical budget, then the
// block is centered in its region. This is what fixes the old cards, whose text
// ran off the right edge and collided with the footer, and whose heart rendered
// as the literal string "&#9829;" (an entity double-escaped through esc()).
// ---------------------------------------------------------------------------

const CARD_W = 1200;
const CARD_H = 630;
const PAPER = '#e9e5d8';
const INK = '#16140d';
const MUTED = '#8a8676';
const FAINT = '#5b5849';
const SIG = '#d9481f';
const GREEN = '#5b7a4a';
const AMBER = '#b5851f';
const ML = 64;
const MR = 64;
const RX = CARD_W - MR;
const MONO = 'IBM Plex Mono, monospace';
const ADV = 0.6; // mono glyph advance in em

const HOSTILE = new Set(['Prompt Injection', 'Threats / Hostility', 'Laundry / Service Ads']);

let _fontCache: Uint8Array | null = null;
function fontBytes(): Uint8Array {
  if (!_fontCache) _fontCache = Uint8Array.from(atob(FONT_BASE64), (c) => c.charCodeAt(0));
  return _fontCache;
}

function esc(s: string): string {
  return String(s ?? '')
    // Strip characters that are illegal in XML 1.0 (control chars other than
    // tab/newline/CR, plus lone surrogates and non-characters). A long pasted
    // article often carries these, and they make resvg's XML parser reject the
    // whole SVG — which is what broke long-message OG cards.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uD800-\uDFFF\uFFFE\uFFFF]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Collapse all whitespace (incl. newlines/tabs) to single spaces. */
function oneLine(s: string): string {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

/** Approximate rendered width of a mono string, in px. */
function tw(str: string, font: number): number {
  return str.length * font * ADV;
}

/** Word-wrap to a character budget, hard-breaking tokens longer than the line. */
function wrapText(text: string, maxChars: number): string[] {
  const words = String(text ?? '')
    .split(/\s+/)
    .filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const raw of words) {
    let w = raw;
    while (w.length > maxChars) {
      if (cur) {
        lines.push(cur);
        cur = '';
      }
      lines.push(w.slice(0, maxChars - 1) + '\u2026');
      w = '';
    }
    if (!w) continue;
    if ((cur ? cur + ' ' + w : w).length > maxChars) {
      if (cur) lines.push(cur);
      cur = w;
    } else {
      cur = cur ? cur + ' ' + w : w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

function midEllipsis(s: string, max: number): string {
  s = String(s ?? '');
  if (s.length <= max) return s;
  const keep = Math.max(6, Math.floor((max - 1) / 2));
  return s.slice(0, keep) + '\u2026' + s.slice(-keep);
}

interface FitOpts {
  start: number;
  min: number;
  lf: number; // line-height factor
  maxLines: number;
  width: number; // px budget
  height: number; // px budget
}
interface Fit {
  font: number;
  lines: string[];
  lh: number;
}

/** Shrink the font until the wrapped copy fits both the width and height budgets. */
function fit(raw: string, o: FitOpts): Fit {
  let font = o.start;
  let lines: string[] = [];
  for (;;) {
    const maxChars = Math.max(6, Math.floor(o.width / (font * ADV)));
    lines = wrapText(raw, maxChars);
    const lh = font * o.lf;
    if (font <= o.min) break;
    if (lines.length <= o.maxLines && lines.length * lh <= o.height) break;
    font -= 2;
  }
  const maxChars = Math.max(6, Math.floor(o.width / (font * ADV)));
  if (lines.length > o.maxLines) {
    lines = lines.slice(0, o.maxLines);
    const k = o.maxLines - 1;
    lines[k] = lines[k].slice(0, maxChars - 1).replace(/[\s\u2026]+$/, '') + '\u2026';
  }
  return { font, lines, lh: font * o.lf };
}

interface Block {
  svg: string;
  top: number;
  bottom: number;
  blockH: number;
}

/** A vertically-centered multiline <text> block within [top, bottom]. */
function centeredBlock(
  lines: string[],
  font: number,
  lh: number,
  x: number,
  top: number,
  bottom: number,
  fill: string,
  weight?: number
): Block {
  const blockH = lines.length * lh;
  const start = top + (bottom - top - blockH) / 2;
  const firstBase = start + font * 0.82;
  const tspans = lines
    .map((l, i) => `<tspan x="${x}" y="${(firstBase + i * lh).toFixed(1)}">${esc(l)}</tspan>`)
    .join('');
  return {
    svg: `<text font-family="${MONO}" font-size="${font}"${weight ? ` font-weight="${weight}"` : ''} fill="${fill}">${tspans}</text>`,
    top: start,
    bottom: start + blockH,
    blockH,
  };
}

/** A top-anchored multiline <text> block starting at `top`. */
function stackedBlock(
  lines: string[],
  font: number,
  lh: number,
  x: number,
  top: number,
  fill: string,
  weight?: number
): { svg: string; bottom: number } {
  const firstBase = top + font * 0.9;
  const tspans = lines
    .map((l, i) => `<tspan x="${x}" y="${(firstBase + i * lh).toFixed(1)}">${esc(l)}</tspan>`)
    .join('');
  return {
    svg: `<text font-family="${MONO}" font-size="${font}"${weight ? ` font-weight="${weight}"` : ''} fill="${fill}">${tspans}</text>`,
    bottom: top + lines.length * lh,
  };
}

function diamond(cx: number, cy: number, r: number, fill: string): string {
  return `<path d="M${cx} ${cy - r}L${cx + r} ${cy}L${cx} ${cy + r}L${cx - r} ${cy}Z" fill="${fill}"/>`;
}

function heart(x: number, y: number, s: number, fill: string): string {
  const sc = (s / 24).toFixed(3);
  return `<path transform="translate(${x},${y}) scale(${sc})" d="M12 21C12 21 3 14.6 3 8.6C3 5.5 5.4 3.1 8.2 3.1C10 3.1 11.4 4.1 12 5.3C12.6 4.1 14 3.1 15.8 3.1C18.6 3.1 21 5.5 21 8.6C21 14.6 12 21 12 21Z" fill="${fill}"/>`;
}

function svgHeader(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">`;
}

function paperDefs(): string {
  return `<defs><pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1.4" cy="1.4" r="1.4" fill="#d5cfbd"/></pattern></defs>`;
}

function paper(): string {
  return `<rect width="${CARD_W}" height="${CARD_H}" fill="${PAPER}"/><rect width="${CARD_W}" height="${CARD_H}" fill="url(#dots)"/>`;
}

function headerBar(): string {
  return (
    diamond(ML + 8, 50, 9, SIG) +
    `<text x="${ML + 28}" y="58" font-family="${MONO}" font-size="24" font-weight="600" letter-spacing="1" fill="${INK}">OP_RETURN</text>` +
    `<text x="${(ML + 28 + tw('OP_RETURN', 24) + 16).toFixed(0)}" y="58" font-family="${MONO}" font-size="15" letter-spacing="2" fill="${MUTED}">THE PERMANENT RECORD</text>` +
    `<text x="${RX}" y="58" text-anchor="end" font-family="${MONO}" font-size="22" fill="${MUTED}">opreturn.xyz</text>` +
    `<rect x="${ML}" y="80" width="${CARD_W - ML - MR}" height="2" fill="${INK}"/>`
  );
}

function footerRule(): string {
  return `<rect x="${ML}" y="534" width="${CARD_W - ML - MR}" height="2" fill="${INK}"/>`;
}

function footerText(line1: string, line2: string, c1: string = SIG): string {
  return (
    `<text x="${ML}" y="574" font-family="${MONO}" font-size="22" font-weight="600" fill="${c1}">${esc(line1)}</text>` +
    `<text x="${ML}" y="602" font-family="${MONO}" font-size="20" fill="${MUTED}">${esc(line2)}</text>`
  );
}

function chip(x: number, y: number, text: string, color: string): { svg: string; w: number } {
  const w = text.length * (15 * ADV + 1) + 26; // includes letter-spacing:1
  return {
    svg:
      `<rect x="${x}" y="${y}" width="${w.toFixed(0)}" height="34" fill="none" stroke="${color}" stroke-width="1.5"/>` +
      `<text x="${x + 13}" y="${y + 23}" font-family="${MONO}" font-size="15" font-weight="600" letter-spacing="1" fill="${color}">${esc(text)}</text>`,
    w,
  };
}

export function messageCardSvg(msg: Message, colName: string): string {
  let svg = svgHeader() + paperDefs() + paper() + headerBar() + footerRule();

  const cat = (msg.category || 'Unclassified').toUpperCase();
  const hostile = HOSTILE.has(msg.category || '');
  const c = chip(110, 116, cat, hostile ? SIG : INK);
  svg += c.svg;

  const mem = !!msg.is_mempool;
  const st = mem ? 'IN MEMPOOL' : 'CONFIRMED';
  const sx = 110 + c.w + 18;
  svg +=
    `<circle cx="${(sx + 5).toFixed(0)}" cy="133" r="5" fill="${mem ? AMBER : GREEN}"/>` +
    `<text x="${(sx + 18).toFixed(0)}" y="139" font-family="${MONO}" font-size="15" font-weight="600" letter-spacing="1" fill="${mem ? AMBER : GREEN}">${st}</text>`;

  const q = fit(oneLine(msg.content || ''), { start: 46, min: 24, lf: 1.34, maxLines: 6, width: RX - 118, height: 322 });
  const b = centeredBlock(q.lines, q.font, q.lh, 118, 178, 512, INK, 500);
  svg += `<rect x="${ML}" y="${b.top.toFixed(0)}" width="5" height="${b.blockH.toFixed(0)}" fill="${SIG}"/>` + b.svg;

  svg += footerText(colName || 'UNTRACKED ADDRESS', midEllipsis(msg.address, 42), SIG);

  const likes = String(msg.likes || 0);
  const lw = tw(likes, 24);
  svg += `<text x="${RX}" y="582" text-anchor="end" font-family="${MONO}" font-size="24" font-weight="600" fill="${SIG}">${likes}</text>`;
  const hx = RX - lw - 24;
  svg += heart(hx, 562, 22, SIG);
  if (msg.fee_rate != null) {
    svg += `<text x="${(hx - 12).toFixed(0)}" y="582" text-anchor="end" font-family="${MONO}" font-size="20" fill="${MUTED}">${esc(msg.fee_rate + ' sat/vB')}</text>`;
  }
  return svg + '</svg>';
}

export function collectionCardSvg(col: CollectionWithStats): string {
  let svg = svgHeader() + paperDefs() + paper() + headerBar() + footerRule();

  const t = fit(col.name, { start: 56, min: 30, lf: 1.12, maxLines: 2, width: RX - 120, height: 150 });
  const titleTop = 150;
  const title = stackedBlock(t.lines, t.font, t.lh, 120, titleTop, INK, 600);
  svg += `<rect x="${ML}" y="${titleTop + 6}" width="5" height="${(t.lines.length * t.lh - 6).toFixed(0)}" fill="${SIG}"/>`;
  svg += title.svg;

  const descTop = title.bottom + 26;
  const d = fit(col.description || '', { start: 27, min: 20, lf: 1.4, maxLines: 3, width: RX - 120, height: 150 });
  svg += stackedBlock(d.lines, d.font, d.lh, 120, descTop, FAINT).svg;

  svg += footerText('ARCHIVE COLLECTION', `${col.address_count} ADDRESSES \u00b7 ${col.message_count} MESSAGES`, SIG);
  return svg + '</svg>';
}

export function categoryCardSvg(category: string, count: number): string {
  let svg = svgHeader() + paperDefs() + paper() + headerBar() + footerRule();
  svg += `<text x="110" y="180" font-family="${MONO}" font-size="18" letter-spacing="2" fill="${MUTED}">CLASSIFIED TRANSMISSIONS</text>`;
  const t = fit(category, { start: 66, min: 34, lf: 1.12, maxLines: 2, width: RX - 115, height: 220 });
  const b = centeredBlock(t.lines, t.font, t.lh, 115, 210, 500, INK, 600);
  svg += `<rect x="${ML}" y="${b.top.toFixed(0)}" width="5" height="${b.blockH.toFixed(0)}" fill="${SIG}"/>` + b.svg;
  svg += footerText(`${count} MESSAGES ARCHIVED`, 'filed under this classification', SIG);
  return svg + '</svg>';
}

export function addressCardSvg(address: string): string {
  let svg = svgHeader() + paperDefs() + paper() + headerBar() + footerRule();
  svg += `<text x="110" y="180" font-family="${MONO}" font-size="18" letter-spacing="2" fill="${MUTED}">ADDRESS RECORD</text>`;
  const t = fit(midEllipsis(address, 44), { start: 46, min: 24, lf: 1.25, maxLines: 2, width: RX - 115, height: 200 });
  const b = centeredBlock(t.lines, t.font, t.lh, 115, 210, 500, INK, 500);
  svg += `<rect x="${ML}" y="${b.top.toFixed(0)}" width="5" height="${b.blockH.toFixed(0)}" fill="${SIG}"/>` + b.svg;
  svg += footerText('EVERY MESSAGE SENT HERE', 'view on-chain \u00b7 opreturn.xyz', SIG);
  return svg + '</svg>';
}

export function defaultCardSvg(): string {
  let svg = svgHeader() + paperDefs() + paper() + headerBar() + footerRule();
  const t = fit('People are leaving messages inside Bitcoin. Forever.', {
    start: 62,
    min: 40,
    lf: 1.08,
    maxLines: 3,
    width: RX - 118,
    height: 230,
  });
  const titleTop = 160;
  const title = stackedBlock(t.lines, t.font, t.lh, 118, titleTop, INK, 600);
  svg += `<rect x="${ML}" y="${titleTop + 6}" width="5" height="${(t.lines.length * t.lh - 6).toFixed(0)}" fill="${SIG}"/>`;
  svg += title.svg;

  const subTop = title.bottom + 30;
  const d = fit('Threats, confessions, prayers, ads, haiku \u2014 archived live from the chain.', {
    start: 28,
    min: 20,
    lf: 1.4,
    maxLines: 2,
    width: RX - 118,
    height: 120,
  });
  svg += stackedBlock(d.lines, d.font, d.lh, 118, subTop, FAINT).svg;

  svg += footerText('OP_RETURN MONITOR', 'live from the chain \u00b7 opreturn.xyz', SIG);
  return svg + '</svg>';
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
