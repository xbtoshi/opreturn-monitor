/**
 * Single-page web UI for The Permanent Record — the "Ledger" layout.
 *
 * No build step: one <style> block, one inline script, string-built HTML.
 * The server injects a crawlable shell (src/seo.ts) into <main id="app">;
 * the script below takes over on boot and re-renders on navigation.
 * Everything in the inline script lives inside a TS template literal, so
 * backslashes are doubled there (\\n, \\u2026, \\d).
 */
export interface PageMeta {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  /** Canonical URL when it differs from `url` (duplicate rows point at their representative). */
  canonical?: string;
  type?: string;
  noindex?: boolean;
  keywords?: string;
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>;
  initialHtml?: string;
}

/** Optional server-side data for the app shell (sidebar collection rows, chain tip). */
export interface ShellData {
  collections?: Array<{ slug: string; name: string; count: number }>;
  tip?: number | null;
}

function esc(s: string): string {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const NAV: Array<[string, string, string, string]> = [
  ['feed', '/feed', 'Feed', 'feed'],
  ['rooms', '/rooms', 'Chat rooms', 'rooms'],
  ['protocols', '/protocols', 'Protocols', 'protocols'],
  ['collections', '/collections', 'Collections', 'collections'],
  ['guide', '/guide', 'Etch a message', ''],
  ['learn', '/learn', 'Learn', 'learn'],
  ['about', '/', 'About', ''],
];

function sidebarHtml(s: ShellData): string {
  let h = '<aside class="side" id="side">';
  h += '<a class="brand" href="/"><span class="logo">OP_RETURN</span><span class="tag">The Permanent Record</span></a>';
  h += '<div class="search"><input id="side-q" type="search" placeholder="Search messages" autocomplete="off" spellcheck="false" aria-label="Search messages" /><kbd>/</kbd></div>';
  h += '<nav class="snav" aria-label="Primary">';
  for (const [key, href, label, count] of NAV) {
    h += `<a href="${href}" data-nav="${key}"><span>${label}</span>${count ? `<span class="n" data-count="${count}"></span>` : ''}</a>`;
  }
  h += '</nav>';
  h += '<div class="sfilters" id="side-filters">';
  if (s.collections && s.collections.length) {
    h += '<div class="sgroup"><span class="slabel">COLLECTION</span>';
    for (const c of s.collections) {
      h += `<a class="srow" href="/c/${esc(c.slug)}"><span class="nm">${esc(c.name)}</span><span class="n">${c.count.toLocaleString('en-US')}</span></a>`;
    }
    h += '</div>';
  }
  h += '</div>';
  h += '<div class="sfoot"><span class="live"><span class="d"></span>LIVE \u00b7 TIP <span data-tip>' + (s.tip ? '#' + s.tip.toLocaleString('en-US') : '\u2014') + '</span></span>';
  h += '<button class="themebtn" data-action="theme" type="button">\u263e Dark</button></div>';
  h += '</aside>';
  return h;
}

function tabbarHtml(): string {
  const tabs: Array<[string, string, string]> = [
    ['feed', '/feed', 'Feed'],
    ['rooms', '/rooms', 'Rooms'],
    ['protocols', '/protocols', 'Protocols'],
    ['collections', '/collections', 'Archive'],
    ['guide', '/guide', 'Etch'],
  ];
  let h = '<nav class="tabbar" aria-label="Sections">';
  for (const [key, href, label] of tabs) h += `<a href="${href}" data-nav="${key}" class="${key === 'guide' ? 'etch' : ''}">${label}</a>`;
  h += '</nav>';
  return h;
}

export function renderIndex(meta?: PageMeta, shell?: ShellData): string {
  const s: ShellData = shell || {};
  const m: PageMeta = meta || {};
  const ogTitle = m.title || 'The Permanent Record — messages inside Bitcoin';
  const ogDesc =
    m.description ||
    'People are leaving messages inside Bitcoin. Forever. Threats, confessions, prayers, ads, haiku — archived live from the chain.';
  const ogUrl = m.url || 'https://opreturn.xyz/';
  const ogImage = m.image || 'https://opreturn.xyz/og/default.png';
  const ogType = m.type || 'website';
  const robotsDirectives = m.noindex
    ? 'noindex, nofollow'
    : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
  const metaKeywords =
    m.keywords ||
    'bitcoin op_return, op_return monitor, bitcoin message board, immutable messages, blockchain memorials, bitcoin graffiti, satoshi tributes, crypto communications';
  const jsonLdScript = m.jsonLd
    ? `<script type="application/ld+json">${JSON.stringify(m.jsonLd)}</script>`
    : '';
  const ogMeta = `<meta name="description" content="${esc(ogDesc)}" />
<meta name="keywords" content="${esc(metaKeywords)}" />
<meta name="author" content="xbtoshi" />
<meta name="robots" content="${robotsDirectives}" />
<meta property="og:site_name" content="The Permanent Record" />
<meta property="og:type" content="${esc(ogType)}" />
<meta property="og:title" content="${esc(ogTitle)}" />
<meta property="og:description" content="${esc(ogDesc)}" />
<meta property="og:url" content="${esc(ogUrl)}" />
<meta property="og:image" content="${esc(ogImage)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(ogTitle)}" />
<meta name="twitter:description" content="${esc(ogDesc)}" />
<link rel="canonical" href="${esc(m.canonical || ogUrl)}" />
<link rel="alternate" type="text/markdown" href="/llms.txt" title="LLM Context (llms.txt)" />
<link rel="sitemap" type="application/xml" href="/sitemap.xml" />
<link rel="api-catalog" type="application/linkset+json" href="/.well-known/api-catalog" />
<link rel="service-desc" type="application/vnd.oai.openapi+json;version=3.0" href="/api/openapi.json" />
<link rel="service-doc" type="text/markdown" href="/llms.txt" />
<link rel="describedby" type="application/json" href="/.well-known/agent-card.json" />
<link rel="describedby" type="text/markdown" href="/auth.md" />
${jsonLdScript}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f3f1ea" />
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#16150f" />
<title>${esc(ogTitle)}</title>
<script>try{var t=localStorage.getItem("opreturn_theme");if(t)document.documentElement.setAttribute("data-theme",t);}catch(e){}</script>
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="icon" href="/favicon.png" sizes="32x32" type="image/png" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
${ogMeta}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Martian+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root{
    --bg:#f3f1ea; --card:#fbfaf6; --dot:#dcd7c9;
    --fg:#16140d; --fg2:#3f3c30; --fg3:#6b6858; --fg4:#8a8676; --fg5:#b0aa98;
    --line:#dcd7c9; --line2:#e6e1d4; --line3:#e6e1d4; --line4:#c9c2b0; --chip:#c9c2b0; --ink:#16140d;
    --sig:#d9481f; --sigH:#b23815; --sigT:#f7e6df; --tok:#0f766e; --amber:#b5851f; --green:#5b7a4a;
    --inv-bg:#16140d; --inv-fg:#f3f1ea; --inv-fg2:#b8b2a2; --inv-fg3:#8a8676; --on-sig:#fbfaf6;
    --hover:rgba(217,72,31,.06);
  }
  @media (prefers-color-scheme:dark){
    :root:not([data-theme="light"]){
      --bg:#16150f; --card:#1e1c15; --dot:#2a2820;
      --fg:#ece7d8; --fg2:#c9c3b2; --fg3:#b0ab99; --fg4:#8f8b7a; --fg5:#6f6b5c;
      --line:#322f24; --line2:#2a2820; --line3:#2a2820; --line4:#403c2d; --chip:#403c2d; --ink:#ece7d8;
      --sig:#e2592d; --sigH:#f06a3e; --sigT:#33231a; --tok:#4fb3a6; --amber:#d6a94a; --green:#8fbf72;
      --inv-bg:#ece7d8; --inv-fg:#16150f; --inv-fg2:#5b5849; --inv-fg3:#8a8676; --on-sig:#fbfaf6;
      --hover:rgba(226,89,45,.1);
    }
  }
  :root[data-theme="dark"]{
    --bg:#16150f; --card:#1e1c15; --dot:#2a2820;
    --fg:#ece7d8; --fg2:#c9c3b2; --fg3:#b0ab99; --fg4:#8f8b7a; --fg5:#6f6b5c;
    --line:#322f24; --line2:#2a2820; --line3:#2a2820; --line4:#403c2d; --chip:#403c2d; --ink:#ece7d8;
    --sig:#e2592d; --sigH:#f06a3e; --sigT:#33231a; --tok:#4fb3a6; --amber:#d6a94a; --green:#8fbf72;
    --inv-bg:#ece7d8; --inv-fg:#16150f; --inv-fg2:#5b5849; --inv-fg3:#8a8676; --on-sig:#fbfaf6;
    --hover:rgba(226,89,45,.1);
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html{color-scheme:light dark}
  body{background:var(--bg);color:var(--fg);font-family:'Space Grotesk',system-ui,sans-serif;-webkit-font-smoothing:antialiased;line-height:1.5}
  a{color:var(--sig);text-decoration:none}
  a:hover{color:var(--sigH)}
  button{font-family:inherit;color:inherit}
  textarea,input{font-family:inherit}
  ::selection{background:var(--sig);color:var(--on-sig)}
  .mono{font-family:'Martian Mono',monospace}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
  @keyframes flick{0%,100%{opacity:1}50%{opacity:.35}}
  @keyframes land{0%{opacity:0;transform:translateY(-8px)}100%{opacity:1;transform:translateY(0)}}
  @keyframes fadein{from{opacity:0}to{opacity:1}}

  /* ---- app shell ---- */
  .shell{min-height:100vh;display:grid;grid-template-columns:264px minmax(0,1fr)}
  .side{position:sticky;top:0;height:100vh;background:var(--card);border-right:1px solid var(--line);display:flex;flex-direction:column;overflow-y:auto;scrollbar-width:thin}
  .stage{min-width:0;display:flex;flex-direction:column}
  .brand{background:none;border:none;text-align:left;padding:22px 22px 18px;display:flex;flex-direction:column;gap:2px;color:var(--fg);cursor:pointer}
  .brand .logo{font-family:'Martian Mono',monospace;font-weight:600;font-size:17px;letter-spacing:-.02em}
  .brand .tag{font-family:'Martian Mono',monospace;font-size:10px;letter-spacing:.12em;color:var(--fg4);text-transform:uppercase}
  .search{margin:0 16px 14px;display:flex;align-items:center;border:1px solid var(--line);background:var(--bg)}
  .search input{flex:1;min-width:0;background:none;border:none;outline:none;padding:9px 12px;font-size:13px;color:var(--fg)}
  .search input::placeholder{color:var(--fg4)}
  .search kbd{font-family:'Martian Mono',monospace;font-size:10px;border:1px solid var(--line);padding:1px 5px;margin-right:8px;color:var(--fg4)}
  .snav{display:flex;flex-direction:column;gap:2px;padding:0 10px}
  .snav a{display:flex;align-items:center;justify-content:space-between;padding:9px 12px;font-size:14px;font-weight:500;color:var(--fg)}
  .snav a:hover{color:var(--sig)}
  .snav a.active{background:var(--inv-bg);color:var(--inv-fg)}
  .snav a .n{font-family:'Martian Mono',monospace;font-size:10px;opacity:.6}
  .sfilters{border-top:1px solid var(--line);margin-top:16px;padding:18px 22px;display:flex;flex-direction:column;gap:20px}
  .sfilters[hidden]{display:none}
  .slabel{font-family:'Martian Mono',monospace;font-size:10px;letter-spacing:.12em;color:var(--fg4)}
  .sgroup{display:flex;flex-direction:column;gap:1px}
  .sgroup .slabel{margin-bottom:6px}
  .seg2{display:grid;grid-template-columns:1fr 1fr;border:1px solid var(--fg)}
  .seg2 a,.seg2 button{border:none;background:transparent;padding:7px 0;font-size:13px;font-weight:600;color:var(--fg);text-align:center;cursor:pointer}
  .seg2 .active{background:var(--inv-bg);color:var(--inv-fg)}
  .srow{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:5px 0;font-size:13px;color:var(--fg2);text-align:left;background:none;border:none;cursor:pointer;min-width:0}
  .srow:hover{color:var(--sig)}
  .srow.active{color:var(--fg);font-weight:600}
  .srow.cat.active{color:var(--sig)}
  .srow .nm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1}
  .srow .n{font-family:'Martian Mono',monospace;font-size:11px;color:var(--fg4);flex:0 0 auto}
  .srow .dot{width:6px;height:6px;flex:0 0 auto;margin-right:8px;background:var(--fg)}
  .srow .dot.sig{background:var(--sig)}
  .srow .dot.mute{background:var(--chip)}
  .sfoot{margin-top:auto;border-top:1px solid var(--line);padding:14px 22px;display:flex;flex-direction:column;gap:10px;font-family:'Martian Mono',monospace;font-size:11px;color:var(--fg3)}
  .live{display:flex;align-items:center;gap:8px;color:var(--sig);font-weight:600;letter-spacing:.08em}
  .live .d{width:7px;height:7px;border-radius:50%;background:var(--sig);animation:pulse 1.6s infinite}
  .themebtn{align-self:flex-start;background:none;border:1px solid var(--line);color:var(--fg);padding:5px 10px;font-family:'Martian Mono',monospace;font-size:11px;cursor:pointer}
  .themebtn:hover{border-color:var(--fg)}

  /* mobile top bar, controls, tab bar */
  .mtop{display:none;position:sticky;top:0;z-index:20;background:var(--card);border-bottom:1px solid var(--line)}
  .mtop .mbar{padding:12px 16px 10px;display:flex;align-items:center;justify-content:space-between}
  .mtop .brandm{background:none;border:none;font-family:'Martian Mono',monospace;font-weight:600;font-size:15px;color:var(--fg);cursor:pointer}
  .mtop .right{display:flex;align-items:center;gap:12px}
  .mtop .tip{font-family:'Martian Mono',monospace;font-size:10px;color:var(--sig);font-weight:600}
  .mctl{display:none;padding:0 16px 12px;gap:8px}
  .mctl .seg2 a{padding:11px 0}
  .mctl .seg2{flex:1}
  .mctl .fbtn{border:1px solid var(--fg);background:none;color:var(--fg);padding:11px 14px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}
  .tabbar{display:none;position:fixed;left:0;right:0;bottom:0;z-index:30;grid-template-columns:repeat(5,1fr);border-top:1px solid var(--fg);background:var(--card);padding-bottom:env(safe-area-inset-bottom)}
  .tabbar a{background:none;border:none;border-top:2px solid transparent;margin-top:-1px;padding:13px 0 18px;font-size:11px;font-weight:600;color:var(--fg3);text-align:center}
  .tabbar a.active{border-top-color:var(--sig);color:var(--fg)}
  .tabbar a.etch{color:var(--sig)}

  /* ---- generic page bits ---- */
  main{display:block}
  .page{padding:36px 44px;display:flex;flex-direction:column;gap:18px;min-width:0;max-width:1180px;width:100%}
  .page.narrow{max-width:1000px}
  .phead{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;flex-wrap:wrap}
  .phead .tt{display:flex;flex-direction:column;gap:6px;min-width:0}
  .kicker{font-family:'Martian Mono',monospace;font-size:11px;letter-spacing:.14em;color:var(--fg4);text-transform:uppercase}
  .title{font-size:32px;font-weight:600;letter-spacing:-.03em;line-height:1.1;overflow-wrap:anywhere}
  .page-title{font-size:32px;overflow-wrap:anywhere;word-break:break-word}
  .lede{font-size:15px;color:var(--fg2);max-width:64ch;line-height:1.5}
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:1px solid var(--fg);background:var(--bg);color:var(--fg);padding:11px 20px;font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap}
  .btn:hover{background:var(--inv-bg);color:var(--inv-fg)}
  .btn-primary{background:var(--sig);color:var(--on-sig);border-color:var(--sig)}
  .btn-primary:hover{background:var(--sigH);border-color:var(--sigH);color:var(--on-sig)}
  .btn-sm{padding:8px 14px;font-size:13px}
  .cta{display:flex;flex-wrap:wrap;gap:12px}
  .box{background:var(--card);border:1px solid var(--line)}
  .empty{padding:60px 24px;text-align:center;font-family:'Martian Mono',monospace;font-size:13px;color:var(--fg4)}
  .status{font-family:'Martian Mono',monospace;font-size:11px;color:var(--fg4);min-height:16px}
  .btn-more{align-self:center;background:none;border:1px solid var(--line);color:var(--fg);padding:10px 18px;font-family:'Martian Mono',monospace;font-size:12px;cursor:pointer}
  .btn-more:hover{border-color:var(--fg)}
  .pills{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
  .pill{display:inline-flex;gap:8px;align-items:center;background:var(--inv-bg);color:var(--inv-fg);border:none;padding:6px 10px;font-size:13px;cursor:pointer}
  .pill .x{opacity:.7}
  .clearall{background:none;border:none;font-family:'Martian Mono',monospace;font-size:11px;color:var(--fg3);cursor:pointer}
  .newbar{display:flex;align-items:center;justify-content:space-between;background:var(--inv-bg);color:var(--inv-fg);border:none;padding:10px 16px;font-size:13px;text-align:left;cursor:pointer;width:100%;animation:land .2s ease}
  .newbar .l{display:flex;align-items:center;gap:10px}
  .newbar .d{width:7px;height:7px;border-radius:50%;background:var(--sig);animation:pulse 1.6s infinite}
  .newbar .r{font-family:'Martian Mono',monospace;font-size:11px;color:var(--sig);font-weight:600}
  .sorttabs{display:flex;gap:22px}
  .sorttabs a{background:none;border:none;border-bottom:2px solid transparent;padding:0 0 6px;font-size:14px;font-weight:600;color:var(--fg4)}
  .sorttabs a.active{border-bottom-color:var(--sig);color:var(--fg)}
  .chips{display:flex;flex-wrap:wrap;gap:6px}
  .chip{padding:8px 12px;font-size:13px;border:1px solid var(--chip);background:transparent;color:var(--fg2);cursor:pointer;white-space:nowrap}
  .chip:hover{border-color:var(--fg);color:var(--fg)}
  .chip.active{background:var(--inv-bg);color:var(--inv-fg);border-color:var(--fg)}

  /* ---- feed rows ---- */
  .feed-grid{display:grid;grid-template-columns:minmax(0,1fr);min-width:0}
  .feed-grid.wide{grid-template-columns:minmax(0,1fr) 312px}
  .list{display:flex;flex-direction:column;background:var(--card);border:1px solid var(--line)}
  .row{padding:20px 24px;border-bottom:1px solid var(--line2);display:flex;flex-direction:column;gap:10px;min-width:0}
  .row:last-child{border-bottom:none}
  .row .meta{display:flex;align-items:center;gap:10px;font-family:'Martian Mono',monospace;font-size:11px;color:var(--fg3);min-width:0}
  .row .meta .dot{width:6px;height:6px;flex:0 0 auto;background:var(--fg)}
  .row .meta .dot.sig{background:var(--sig)}
  .row .meta .dot.mute{background:var(--chip)}
  .row .meta .dot.tok{background:var(--tok)}
  .row .meta .cat{background:none;border:none;padding:0;font-family:inherit;font-size:inherit;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--fg3);white-space:nowrap;cursor:pointer}
  .row .meta .cat.sig{color:var(--sig)}
  .row .meta .cat.tok{color:var(--tok)}
  .row .meta .col{background:none;border:none;padding:0;font-family:inherit;font-size:inherit;color:var(--fg2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;min-width:0;flex:0 1 auto}
  .row .meta .col:hover,.row .meta .cat:hover{color:var(--sig)}
  .row .meta .sep{color:var(--fg4)}
  .row .meta .when{margin-left:auto;color:var(--fg4);white-space:nowrap}
  .row .meta .when.mem{color:var(--amber)}
  .row .meta .badge{font-family:'Martian Mono',monospace;font-size:9px;font-weight:600;letter-spacing:.06em;padding:1px 6px;border:1px solid currentColor;white-space:nowrap}
  .opline{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 12px;font-family:'Martian Mono',monospace;font-size:12px;color:var(--fg3)}
  .opline .amt{font-family:'Space Grotesk',sans-serif;font-size:21px;font-weight:600;color:var(--fg)}
  .opline .tk{color:var(--tok);font-weight:600}
  .opline .arrow{color:var(--fg5)}
  .row .content{background:none;border:none;padding:0;text-align:left;color:var(--fg);font-size:21px;line-height:1.36;font-weight:500;letter-spacing:-.005em;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;max-width:60ch;cursor:pointer;display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical;overflow:hidden}
  .row .content:hover{opacity:.8}
  .row .content.proto{font-family:'Martian Mono',monospace;font-size:13px;font-weight:400;line-height:1.5;color:var(--fg2)}
  .row .readmore{font-family:'Martian Mono',monospace;font-size:11px;font-weight:600;color:var(--sig)}
  .row .foot{display:flex;align-items:center;gap:14px;font-family:'Martian Mono',monospace;font-size:11px;color:var(--fg4);min-width:0}
  .row .foot .chain{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
  .row .foot .chain a{color:var(--fg4)}
  .row .foot .chain a:hover{color:var(--sig)}
  .row .foot .open{margin-left:auto;background:none;border:none;font-family:inherit;font-size:11px;color:var(--fg);white-space:nowrap;cursor:pointer}
  .row .foot .open:hover{color:var(--sig)}
  .vg{display:inline-flex;align-items:center;border:1px solid var(--line)}
  .vg button{background:transparent;color:var(--fg3);border:none;padding:4px 9px;font-size:11px;cursor:pointer;line-height:1.2}
  .vg button:hover{color:var(--fg)}
  .vg button.up.voted{background:var(--green);color:#fff}
  .vg button.down.voted{background:var(--sig);color:#fff}
  .vg button.mining{color:var(--sig);animation:flick .8s infinite;cursor:progress}
  .vg .score{padding:0 4px;font-weight:600;color:var(--fg);min-width:30px;text-align:center;font-family:'Martian Mono',monospace;font-size:11px}
  .vg .score.voted{color:var(--sig)}
  .vg.big{border-color:var(--fg);font-size:14px}
  .vg.big button{padding:11px 16px;font-size:14px;font-weight:600;color:var(--fg)}
  .vg.big .score{padding:11px 14px;border-left:1px solid var(--fg);border-right:1px solid var(--fg);font-size:13px}

  /* right rail */
  .rail{border-left:1px solid var(--line);padding:36px 28px;display:flex;flex-direction:column;gap:30px;font-size:13px;min-width:0}
  .rail .grp{display:flex;flex-direction:column;gap:12px}
  .census{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--line);border:1px solid var(--line)}
  .census div{background:var(--card);padding:12px 14px;display:flex;flex-direction:column;gap:2px}
  .census .v{font-family:'Martian Mono',monospace;font-size:17px;font-weight:600}
  .census .l{color:var(--fg3);font-size:12px}
  .blk{display:grid;grid-template-columns:88px 1fr auto;gap:10px;padding:6px 0;border-bottom:1px solid var(--line2);font-family:'Martian Mono',monospace;font-size:11px;color:var(--fg2)}
  .blk b{font-weight:600;color:var(--fg)}
  .blk span{color:var(--fg4)}
  .mix{display:flex;flex-direction:column;gap:4px}
  .mix .t{display:flex;justify-content:space-between;font-size:12px;color:var(--fg2)}
  .mix .t span:last-child{font-family:'Martian Mono',monospace;font-size:11px}
  .mix .bar{height:4px;background:var(--line2)}
  .mix .bar i{display:block;height:4px;background:var(--fg)}
  .mix .bar i.sig{background:var(--sig)}
  .sugcard{text-align:left;background:none;border:1px dashed var(--chip);padding:14px;display:flex;flex-direction:column;gap:6px;color:var(--fg);cursor:pointer}
  .sugcard b{font-weight:600;font-size:13px}
  .sugcard span{font-family:'Martian Mono',monospace;font-size:11px;font-weight:600;color:var(--sig)}

  /* ---- detail ---- */
  .back{align-self:flex-start;background:none;border:none;font-family:'Martian Mono',monospace;font-size:12px;color:var(--fg3);cursor:pointer;padding:0}
  .back:hover{color:var(--sig)}
  .dgrid{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:36px;align-items:start}
  .dmain{display:flex;flex-direction:column;gap:26px;min-width:0}
  .artifact{background:var(--card);border:1.5px solid var(--fg);box-shadow:10px 10px 0 var(--fg);padding:40px 40px 28px;display:flex;flex-direction:column;gap:24px;min-width:0}
  .artifact .meta{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-family:'Martian Mono',monospace;font-size:11px}
  .artifact .meta .dot{width:6px;height:6px;background:var(--fg)}
  .artifact .meta .dot.sig{background:var(--sig)}
  .artifact .meta .dot.tok{background:var(--tok)}
  .artifact .meta .catl{font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--fg3)}
  .artifact .meta .catl.sig{color:var(--sig)}
  .artifact .meta .catl.tok{color:var(--tok)}
  .artifact .meta .st{margin-left:auto;font-weight:600}
  .st.conf{color:var(--green)}
  .st.mem{color:var(--amber)}
  .artifact blockquote{font-size:42px;line-height:1.16;font-weight:600;letter-spacing:-.025em;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;border:none;margin:0}
  .artifact blockquote.med{font-size:30px}
  .artifact blockquote.long{font-size:20px;font-weight:500;line-height:1.35}
  .artifact blockquote.proto{font-family:'Martian Mono',monospace;font-size:15px;font-weight:400;line-height:1.5;letter-spacing:0;color:var(--fg2)}
  .artifact .acts{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding-top:20px;border-top:1px solid var(--line2);white-space:nowrap}
  .artifact .acts .share{margin-left:auto;background:var(--sig);color:var(--on-sig);border:none;padding:12px 20px;font-size:14px;font-weight:600;cursor:pointer}
  .artifact .acts .share:hover{background:var(--sigH)}
  .artifact .acts .act{border:1px solid var(--fg);background:none;color:var(--fg);padding:11px 16px;font-family:'Martian Mono',monospace;font-size:12px;cursor:pointer}
  .artifact .acts .act:hover{background:var(--inv-bg);color:var(--inv-fg)}
  .more{display:flex;flex-direction:column;gap:8px}
  .more a{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;padding:12px 0;border-bottom:1px solid var(--line);font-size:14px;color:var(--fg)}
  .more a:hover{color:var(--sig)}
  .more a span:first-child{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .more a span:last-child{font-family:'Martian Mono',monospace;font-size:11px;color:var(--fg4)}
  .facts{background:var(--card);border:1px solid var(--line);display:flex;flex-direction:column;min-width:0}
  .facts .h{padding:14px 20px;border-bottom:1px solid var(--line);font-family:'Martian Mono',monospace;font-size:10px;letter-spacing:.12em;color:var(--fg4)}
  .facts .f{display:grid;grid-template-columns:96px minmax(0,1fr);gap:12px;padding:11px 20px;border-bottom:1px solid var(--line2);font-family:'Martian Mono',monospace;font-size:12px}
  .facts .f .k{color:var(--fg4);font-size:10px;letter-spacing:.08em;padding-top:2px}
  .facts .f .v{overflow-wrap:anywhere}
  .facts .f .v button{background:none;border:none;padding:0;font:inherit;color:inherit;text-align:left;cursor:pointer;overflow-wrap:anywhere}
  .facts .f .v button:hover{color:var(--sig)}
  .facts .ext{padding:14px 20px;font-family:'Martian Mono',monospace;font-size:11px;font-weight:600;color:var(--sig)}
  .ops{display:flex;flex-direction:column;border-top:1px solid var(--line2)}
  .ops .op{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:baseline;padding:8px 0;border-bottom:1px solid var(--line2);font-family:'Martian Mono',monospace;font-size:12px;color:var(--fg3)}
  .ops .op code{color:var(--fg);font-size:11px;word-break:break-all}
  .ops .op .hex{color:var(--fg5);font-size:10px;word-break:break-all;flex-basis:100%}
  .ops .op .pl{font-weight:600;color:var(--fg2);text-transform:uppercase;letter-spacing:.06em;font-size:10px}
  .ops .op .pl.tok{color:var(--tok)}
  .caption{font-family:'Martian Mono',monospace;font-size:11px;color:var(--fg4)}
  .inline-media{margin:4px 0}
  .inline-media img{display:block;max-width:100%;min-width:min(100%,160px);height:auto;max-height:360px;image-rendering:pixelated;border:1px solid var(--line2);background:#fff}
  .inline-media.file{font-family:'Martian Mono',monospace;font-size:11px;color:var(--fg4)}

  /* ---- tables (collections, protocols) ---- */
  .table{background:var(--card);border:1px solid var(--line);display:flex;flex-direction:column}
  .trow{display:grid;gap:20px;padding:16px 24px;border-bottom:1px solid var(--line2);align-items:center;color:var(--fg);text-align:left;background:none;border-left:none;border-right:none;border-top:none;min-width:0}
  .trow:last-child{border-bottom:none}
  .trow:hover{background:var(--hover);color:var(--fg)}
  .trow.cols{grid-template-columns:72px minmax(0,1fr) 100px}
  .trow.protos{grid-template-columns:minmax(0,1fr) 90px 160px;padding:13px 22px;gap:18px;font-size:14px}
  .trow .code{font-family:'Martian Mono',monospace;font-size:11px;color:var(--fg4)}
  .trow .nm{display:flex;flex-direction:column;gap:3px;min-width:0}
  .trow .nm b{font-size:17px;font-weight:600;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}
  .trow .nm b .hot{font-family:'Martian Mono',monospace;font-size:10px;color:var(--sig)}
  .trow .nm b .id{font-family:'Martian Mono',monospace;font-size:10px;font-weight:400;color:var(--fg4)}
  .trow .nm b .id.tok{color:var(--tok)}
  .trow .nm .d{font-size:13px;color:var(--fg3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .trow .cnt{font-family:'Martian Mono',monospace;font-size:13px;text-align:right;font-weight:600;white-space:nowrap}
  .trow.protos .nm b{font-size:14px}
  .trow.protos .cnt{font-size:12px;font-weight:400}
  .trow .share{height:6px;background:var(--line2);display:block}
  .trow .share i{display:block;height:6px;background:var(--fg)}
  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1px;background:var(--line);border:1px solid var(--line)}
  .stat{background:var(--card);padding:18px 20px;display:flex;flex-direction:column;gap:2px;color:inherit}
  .stat .v{font-family:'Martian Mono',monospace;font-size:24px;font-weight:600;letter-spacing:-.02em;color:var(--sig)}
  .stat .l{font-size:12px;color:var(--fg3)}
  .compbar{display:flex;height:10px;border:1px solid var(--line);background:var(--line2)}
  .compbar i{display:block;height:100%}
  .legend{display:flex;flex-wrap:wrap;gap:6px 18px;font-family:'Martian Mono',monospace;font-size:11px;color:var(--fg3)}
  .legend i{display:inline-block;width:8px;height:8px;margin-right:6px;vertical-align:middle}
  .rawbox{background:var(--inv-bg);color:var(--inv-fg);font-family:'Martian Mono',monospace;font-size:11px;padding:12px 14px;overflow-wrap:anywhere;white-space:pre-wrap}

  /* ---- chat ---- */
  .room{background:var(--card);border:1px solid var(--line);padding:22px;display:flex;flex-direction:column;gap:12px}
  .turn{display:flex;flex-direction:column;gap:4px;max-width:70%;align-self:flex-start;align-items:flex-start;position:relative}
  .turn.party{align-self:flex-end;align-items:flex-end}
  .who-line{font-family:'Martian Mono',monospace;font-size:11px;font-weight:600;color:var(--fg3);display:flex;gap:8px;flex-wrap:wrap}
  .who-line .to{font-weight:400;color:var(--fg4)}
  .bubble{text-align:left;background:var(--bg);border:1px solid var(--line);color:var(--fg);padding:11px 14px;font-size:15px;line-height:1.4;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;max-width:100%}
  .turn.party .bubble{background:var(--sigT);border-color:var(--sig)}
  .bubble.mem{opacity:.7;border-style:dashed}
  .bubble-text{cursor:pointer}
  .bubble .readmore{display:block;font-family:'Martian Mono',monospace;font-size:11px;font-weight:600;color:var(--sig);margin-top:8px}
  .bubble-meta{display:flex;flex-wrap:wrap;align-items:center;gap:10px;font-family:'Martian Mono',monospace;font-size:10px;color:var(--fg4)}
  .bubble-meta .cat{font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--fg3)}
  .bubble-meta .cat.sig{color:var(--sig)}
  .bubble-meta .st.mem{color:var(--amber)}
  .day{align-self:center;font-family:'Martian Mono',monospace;font-size:10px;letter-spacing:.12em;color:var(--fg4);border:1px solid var(--line);padding:4px 10px;margin:10px 0 6px;background:var(--bg)}
  .roomfoot{display:flex;justify-content:space-between;align-items:center;gap:12px;font-family:'Martian Mono',monospace;font-size:11px;color:var(--fg3);flex-wrap:wrap}
  .roomfoot a.etch{background:var(--sig);color:var(--on-sig);font-weight:600;padding:11px 16px;font-size:11px}
  .roomfoot a.etch:hover{background:var(--sigH)}
  .keb{border:1px solid var(--line);background:var(--card);min-width:0}
  .keb-head{display:flex;align-items:center;gap:10px;padding:9px 14px;background:var(--inv-bg);color:var(--inv-fg);font-family:'Martian Mono',monospace;font-size:11px;letter-spacing:.06em;width:100%;border:none;text-align:left;cursor:pointer}
  .keb-badge{margin-left:auto;background:var(--sig);color:var(--on-sig);padding:2px 7px;font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
  .keb-body{display:none;grid-template-columns:1fr auto 1fr;gap:16px;align-items:center;padding:16px 18px}
  .keb.open .keb-body{display:grid}
  .keb-party{display:flex;flex-direction:column;gap:5px;min-width:0}
  .keb-role{font-family:'Martian Mono',monospace;font-size:10px;color:var(--fg4);letter-spacing:.08em;font-weight:600}
  .keb-name{font-size:15px;font-weight:600}
  .keb-key{font-family:'Martian Mono',monospace;font-size:11px;color:var(--fg3);display:flex;flex-direction:column;gap:2px;overflow-wrap:anywhere}
  .keb-fp{font-family:'Martian Mono',monospace;font-size:10px;color:var(--fg4);word-break:break-all}
  .keb-desc{font-size:12px;color:var(--fg3);line-height:1.4}
  .keb-links{display:flex;gap:12px;margin-top:3px;flex-wrap:wrap}
  .keb-links a{font-family:'Martian Mono',monospace;font-size:11px}
  .keb-divider{font-size:22px;color:var(--fg4);font-family:'Martian Mono',monospace;display:flex;align-items:center;justify-content:center}

  /* crypto envelopes (kept from the previous build, restyled to tokens) */
  .crypto-sig-badge{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;padding:6px 10px;background:rgba(91,122,74,.1);border:1px solid var(--green);color:var(--fg);font-family:'Martian Mono',monospace;font-size:11px;margin-bottom:8px}
  .crypto-sig-badge .sig-icon{font-size:13px}
  .crypto-sig-badge strong{color:var(--green)}
  .crypto-sig-badge code{background:rgba(0,0,0,.06);padding:1px 4px;font-size:10px}
  .crypto-envelope{margin-top:8px;border:1px solid var(--line);background:var(--card);padding:10px 12px;display:flex;flex-direction:column;gap:8px;min-width:0}
  .crypto-envelope.bie1{border-left:3px solid var(--amber)}
  .crypto-envelope.pgp{border-left:3px solid #3d6e8f}
  .env-head{display:flex;align-items:center;gap:8px}
  .env-icon{font-size:16px}
  .env-info{display:flex;flex-direction:column;gap:1px;min-width:0}
  .env-title{font-size:13px;font-weight:600;color:var(--fg)}
  .env-sub{font-family:'Martian Mono',monospace;font-size:10px;color:var(--fg4);overflow-wrap:anywhere}
  .env-sub code{color:var(--fg2)}
  .env-actions{display:flex;flex-wrap:wrap;gap:6px}
  .env-btn{background:var(--bg);border:1px solid var(--line);color:var(--fg);padding:5px 10px;font-family:'Martian Mono',monospace;font-size:10px;cursor:pointer;display:inline-flex;align-items:center;gap:5px}
  .env-btn:hover{background:var(--inv-bg);color:var(--inv-fg);border-color:var(--inv-bg)}
  .env-btn.decrypt-btn{background:var(--sig);color:var(--on-sig);border-color:var(--sig);font-weight:600}
  .env-btn.decrypt-btn:hover{background:var(--sigH);border-color:var(--sigH)}
  .env-decrypted{background:rgba(91,122,74,.12);border:1px solid var(--green);padding:10px;font-family:'Martian Mono',monospace;font-size:12px;color:var(--fg);white-space:pre-wrap;word-break:break-word}
  .env-armor{max-height:180px;overflow:auto;background:var(--bg);border:1px solid var(--line2);padding:8px}
  .env-armor pre{margin:0;font-family:'Martian Mono',monospace;font-size:10px;line-height:1.35;color:var(--fg3);white-space:pre-wrap;word-break:break-all}
  .env-armor-toggle{margin-top:6px}
  .env-text-btn{background:none;border:none;color:var(--fg4);font-family:'Martian Mono',monospace;font-size:10px;cursor:pointer;padding:0;text-decoration:underline}
  .env-text-btn:hover{color:var(--sig)}

  /* ---- etch ---- */
  .etchgrid{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:40px;align-items:start}
  .steps{display:flex;flex-direction:column;border:1px solid var(--line);background:var(--card)}
  .step{display:grid;grid-template-columns:40px minmax(0,1fr);gap:16px;padding:18px 20px;border:none;border-bottom:1px solid var(--line2);background:none;text-align:left;color:var(--fg);cursor:pointer}
  .step:last-child{border-bottom:none}
  .step .n{font-family:'Martian Mono',monospace;font-size:13px;font-weight:600;color:var(--on-sig);background:var(--sig);width:34px;height:34px;display:flex;align-items:center;justify-content:center}
  .step .b{display:flex;flex-direction:column;gap:6px;min-width:0}
  .step .t{font-size:17px;font-weight:600;display:flex;justify-content:space-between;gap:12px}
  .step .t .sign{font-family:'Martian Mono',monospace;color:var(--fg4)}
  .step .body{font-size:15px;color:var(--fg2);line-height:1.55;display:none}
  .step.open .body{display:block}
  .step .code{margin-top:10px;background:var(--inv-bg);color:var(--inv-fg);font-family:'Martian Mono',monospace;font-size:11px;padding:12px 14px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.5}
  .sticky{position:sticky;top:36px;display:flex;flex-direction:column;gap:18px}
  .callout{border:1px solid var(--sig);background:var(--sigT);padding:16px 18px;display:flex;flex-direction:column;gap:6px}
  .callout .b{font-family:'Martian Mono',monospace;font-size:11px;color:var(--sig);letter-spacing:.08em;font-weight:600}
  .callout p{font-size:14px;color:var(--fg2);line-height:1.5}
  .encoder{border:1px solid var(--line);background:var(--card);display:flex;flex-direction:column}
  .encoder .h{padding:12px 18px;border-bottom:1px solid var(--line);font-family:'Martian Mono',monospace;font-size:10px;letter-spacing:.12em;color:var(--fg4)}
  .encoder .bd{padding:16px 18px;display:flex;flex-direction:column;gap:12px}
  .encoder textarea{border:1px solid var(--line);background:var(--bg);color:var(--fg);padding:11px 12px;font-size:14px;resize:vertical;outline:none;min-height:76px}
  .encoder textarea:focus{border-color:var(--sig)}
  .encoder .meta{display:flex;justify-content:space-between;font-family:'Martian Mono',monospace;font-size:11px;color:var(--fg3);gap:10px}
  .encoder .hex{background:var(--inv-bg);color:var(--inv-fg);font-family:'Martian Mono',monospace;font-size:11px;padding:10px 12px;overflow-wrap:anywhere;min-height:38px;max-height:140px;overflow:auto}
  .gnote{font-family:'Martian Mono',monospace;font-size:11px;color:var(--fg4)}

  /* ---- about / landing ---- */
  .hero{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:48px;padding:64px 48px;background-image:radial-gradient(var(--dot) 1px,transparent 1px);background-size:22px 22px}
  .hero .l{display:flex;flex-direction:column;gap:22px;min-width:0}
  .pill-live{align-self:flex-start;display:inline-flex;align-items:center;gap:8px;border:1px solid var(--fg);background:var(--bg);padding:6px 12px;font-family:'Martian Mono',monospace;font-size:11px}
  .pill-live .d{width:6px;height:6px;border-radius:50%;background:var(--sig);animation:pulse 1.6s infinite}
  .hero h1{font-size:80px;line-height:.94;font-weight:600;letter-spacing:-.035em;text-wrap:balance}
  .hero .lede{font-size:18px;max-width:52ch}
  .hero .btn{padding:15px 28px;font-size:16px}
  .livepanel{background:#16140d;color:#f3f1ea;display:flex;flex-direction:column;align-self:start;min-width:0}
  .livepanel .h{padding:12px 18px;border-bottom:1px solid #3f3c30;font-family:'Martian Mono',monospace;font-size:11px;color:#d9481f;font-weight:600;letter-spacing:.1em}
  .livepanel a{text-align:left;background:none;border:none;border-bottom:1px solid #2a2820;padding:14px 18px;display:flex;flex-direction:column;gap:5px;color:#e9e5d8}
  .livepanel a:hover{color:#fff;background:#1e1c15}
  .livepanel a .k{font-family:'Martian Mono',monospace;font-size:10px;color:#8a8676;text-transform:uppercase}
  .livepanel a .c{font-size:15px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-wrap}
  .about-sec{padding:40px 48px;border-top:1px solid var(--fg);display:flex;flex-direction:column;gap:18px}
  .about-grid{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:36px;align-items:start}
  .featured{background:var(--card);border:1.5px solid var(--fg);box-shadow:10px 10px 0 var(--fg);padding:28px;display:flex;flex-direction:column;gap:14px;cursor:pointer;min-width:0}
  .featured .k{font-family:'Martian Mono',monospace;font-size:11px;letter-spacing:.12em;color:var(--fg4)}
  .featured blockquote{font-size:26px;font-weight:600;letter-spacing:-.02em;line-height:1.2;white-space:pre-wrap;word-break:break-word;display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden}
  .featured .m{display:flex;flex-wrap:wrap;gap:14px;font-family:'Martian Mono',monospace;font-size:11px;color:var(--fg4)}
  .chart{display:flex;flex-direction:column;gap:10px}
  .faq{display:flex;flex-direction:column;gap:6px}
  .faq-item{text-align:left;background:none;border:none;border-bottom:1px solid var(--line);padding:16px 0;display:flex;flex-direction:column;gap:10px;color:var(--fg);cursor:pointer}
  .faq-q{display:flex;justify-content:space-between;gap:16px;font-size:17px;font-weight:600}
  .faq-q .sign{font-family:'Martian Mono',monospace;color:var(--fg4)}
  .faq-a{font-size:14px;color:var(--fg2);line-height:1.6;max-width:76ch;display:none}
  .faq-item.open .faq-a{display:block}
  .faq-grid{display:contents}

  /* ---- learn / articles ---- */
  .crumbs{display:flex;gap:8px;font-family:'Martian Mono',monospace;font-size:11px;color:var(--fg4)}
  .art{display:flex;flex-direction:column;gap:22px;max-width:1080px}
  .art-head{display:flex;flex-direction:column;gap:10px;max-width:72ch}
  .art-title{font-size:38px;font-weight:600;letter-spacing:-.03em;line-height:1.08;text-wrap:balance}
  .art-meta{font-family:'Martian Mono',monospace;font-size:11px;color:var(--fg4)}
  .answer{border:1.5px solid var(--fg);background:var(--card);padding:18px 22px;display:flex;flex-direction:column;gap:8px;max-width:72ch;box-shadow:8px 8px 0 var(--fg)}
  .answer p{font-size:17px;line-height:1.5;font-weight:500}
  .art-grid{display:grid;grid-template-columns:minmax(0,72ch) 240px;gap:48px;align-items:start}
  .art-body{font-size:17px;line-height:1.6;color:var(--fg);display:flex;flex-direction:column;gap:16px;min-width:0}
  .art-body h2{font-size:26px;font-weight:600;letter-spacing:-.02em;line-height:1.15;margin-top:22px;scroll-margin-top:24px}
  .art-body h3{font-size:19px;font-weight:600;margin-top:8px;scroll-margin-top:24px}
  .art-body p,.art-body li{overflow-wrap:anywhere}
  .art-body ul,.art-body ol{padding-left:22px;display:flex;flex-direction:column;gap:6px}
  .art-body blockquote{border-left:3px solid var(--sig);padding:6px 16px;color:var(--fg2)}
  .art-body pre{background:var(--inv-bg);color:var(--inv-fg);font-family:'Martian Mono',monospace;font-size:12px;line-height:1.5;padding:14px 16px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}
  .art-body code{font-family:'Martian Mono',monospace;font-size:.9em;background:var(--line2);padding:1px 5px}
  .art-body pre code{background:none;padding:0;font-size:inherit}
  .art-body table{border-collapse:collapse;width:100%;font-size:14px;background:var(--card);border:1px solid var(--line)}
  .art-body th,.art-body td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line2);vertical-align:top}
  .art-body th{font-family:'Martian Mono',monospace;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--fg4)}
  .art-body a{text-decoration:underline;text-underline-offset:3px}
  .art-related{margin-top:28px;border-top:1px solid var(--line);padding-top:16px;display:flex;flex-direction:column;gap:8px}
  .art-related ul{padding-left:0;list-style:none}
  .art-toc{position:sticky;top:36px;display:flex;flex-direction:column;gap:10px;font-size:13px}
  .art-toc ol{padding-left:0;list-style:none;display:flex;flex-direction:column;gap:6px;border-left:1px solid var(--line)}
  .art-toc a{display:block;padding:2px 12px;color:var(--fg2)}
  .art-toc a:hover{color:var(--sig)}
  .trow.learn{grid-template-columns:minmax(0,1fr) 70px}
  .trow.learn .nm .code{margin-bottom:2px}
  .trow.learn .nm .d{white-space:normal}

  /* ---- modals & sheet ---- */
  .scrim{position:fixed;inset:0;background:rgba(22,20,13,.55);display:flex;align-items:center;justify-content:center;z-index:50;padding:20px}
  .scrim[hidden]{display:none}
  .modal{background:var(--card);border:1.5px solid var(--fg);box-shadow:12px 12px 0 var(--fg);width:min(540px,100%);max-height:90vh;overflow:auto;display:flex;flex-direction:column}
  .modal-head{display:flex;justify-content:space-between;align-items:center;background:var(--inv-bg);color:var(--inv-fg);padding:14px 20px;font-family:'Martian Mono',monospace;font-size:12px;letter-spacing:.08em}
  .modal-x{background:none;border:none;color:var(--inv-fg);cursor:pointer;font-size:14px;line-height:1}
  .modal-body{padding:22px;display:flex;flex-direction:column;gap:16px}
  .modal-lede{font-size:14px;color:var(--fg2);line-height:1.5}
  .fld{display:flex;flex-direction:column;gap:6px}
  .fld>span{font-family:'Martian Mono',monospace;font-size:11px;letter-spacing:.08em;color:var(--fg4);text-transform:uppercase}
  .fld input,.fld select,.fld textarea{width:100%;background:var(--bg);border:1px solid var(--line);color:var(--fg);padding:11px 12px;font-family:'Martian Mono',monospace;font-size:13px;border-radius:0;outline:none}
  .fld textarea{font-family:'Space Grotesk',sans-serif;resize:vertical}
  .fld input:focus,.fld select:focus,.fld textarea:focus{border-color:var(--sig)}
  .fld input.ok{border-color:var(--green)}
  .fld input.bad{border-color:var(--sig)}
  .modal-msg{font-family:'Martian Mono',monospace;font-size:11px;min-height:16px;color:var(--fg4)}
  .modal-msg.err{color:var(--sig)}
  .modal-msg.ok{color:var(--green)}
  .modal-foot{display:flex;gap:10px;justify-content:flex-end;padding:0 22px 22px}
  .sheet-scrim{position:fixed;inset:0;z-index:40;background:rgba(22,20,13,.55);display:flex;flex-direction:column;justify-content:flex-end}
  .sheet-scrim[hidden]{display:none}
  .sheet{background:var(--card);border-top:1.5px solid var(--fg);max-height:88vh;overflow-y:auto;display:flex;flex-direction:column;padding-bottom:env(safe-area-inset-bottom)}
  .sheet .sh{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid var(--line)}
  .sheet .sh b{font-size:18px;font-weight:600}
  .sheet .sb{padding:16px 18px;display:flex;flex-direction:column;gap:18px}
  .sheet .sb .seg2 a{padding:11px 0;font-size:14px}
  .sheet .sb .grp{display:flex;flex-direction:column;gap:8px}
  .sheet .chip{padding:10px 12px;display:inline-flex;align-items:center;gap:7px}
  .sheet .chip .dot{width:6px;height:6px;background:var(--fg)}
  .sheet .chip .dot.sig{background:var(--sig)}
  .sheet .chip .dot.mute{background:var(--chip)}
  .sheet .sf{padding:12px 18px 22px;border-top:1px solid var(--line)}
  .sheet .sf .btn{width:100%;padding:15px 0;font-size:15px}
  body.locked{overflow:hidden}

  /* ---- compatibility for server-rendered shells (seo.ts) ---- */
  .wrap{padding:36px 44px;max-width:1180px;display:flex;flex-direction:column;gap:18px}
  .wrap-narrow{max-width:1000px}
  .wrap-card{max-width:1180px}
  .hero-title{font-size:56px;line-height:1;font-weight:600;letter-spacing:-.035em;text-wrap:balance}
  h3.content{margin:0}
  .featured .inner{display:contents}
  .featured .meta{display:flex;flex-wrap:wrap;gap:14px;font-family:'Martian Mono',monospace;font-size:11px;color:var(--fg4)}
  .featured .strong{font-weight:600;color:var(--fg)}
  .featured .sig{color:var(--sig)}
  .featured .k,.featured .kicker{font-family:'Martian Mono',monospace;font-size:11px;letter-spacing:.12em;color:var(--fg4)}
  .cat{font-family:'Martian Mono',monospace;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--fg3)}
  .cat.proto{color:var(--tok)}
  .fee,.time{font-family:'Martian Mono',monospace;font-size:11px;color:var(--fg4)}
  .col-grid{display:flex;flex-direction:column;background:var(--card);border:1px solid var(--line)}
  .col-card{display:grid;grid-template-columns:72px minmax(0,1fr) 100px;gap:20px;padding:16px 24px;border-bottom:1px solid var(--line2);color:var(--fg);align-items:center}
  .col-card .top{font-family:'Martian Mono',monospace;font-size:11px;color:var(--fg4)}
  .col-card .name{font-size:17px;font-weight:600}
  .col-card .desc{font-size:13px;color:var(--fg3)}
  .col-card .foot{font-family:'Martian Mono',monospace;font-size:12px;color:var(--fg4);text-align:right}
  .guide-steps{display:flex;flex-direction:column;border:1px solid var(--line);background:var(--card)}
  .gstep{display:grid;grid-template-columns:40px minmax(0,1fr);gap:16px;padding:18px 20px;border-bottom:1px solid var(--line2)}
  .gnum{font-family:'Martian Mono',monospace;font-size:13px;font-weight:600;color:var(--on-sig);background:var(--sig);width:34px;height:34px;display:flex;align-items:center;justify-content:center}
  .gstep h3{font-size:17px;font-weight:600;margin-bottom:6px}
  .gstep p{font-size:15px;color:var(--fg2);line-height:1.55}
  .gstep .code{margin-top:10px;background:var(--inv-bg);color:var(--inv-fg);font-family:'Martian Mono',monospace;font-size:11px;padding:12px 14px;white-space:pre-wrap;overflow-wrap:anywhere}
  .faq-wrap{display:flex;flex-direction:column;gap:18px}
  .faq-wrap .faq-item{display:flex}
  .faq-wrap .faq-a{display:block}
  .metagrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1px;background:var(--line);border:1px solid var(--line)}
  .cell{background:var(--card);padding:12px 16px;display:flex;flex-direction:column;gap:4px}
  .cell .k{font-family:'Martian Mono',monospace;font-size:10px;letter-spacing:.08em;color:var(--fg4)}
  .cell .v{font-family:'Martian Mono',monospace;font-size:12px;overflow-wrap:anywhere}
  .actions{display:flex;flex-wrap:wrap;gap:10px}
  .act{border:1px solid var(--fg);background:none;color:var(--fg);padding:11px 16px;font-family:'Martian Mono',monospace;font-size:12px}
  .artifact .bar{display:flex;justify-content:space-between;align-items:center;padding:14px 22px;border-bottom:1px solid var(--line);background:var(--inv-bg);color:var(--inv-fg);font-family:'Martian Mono',monospace;font-size:11px;letter-spacing:.08em}
  .pad{padding:24px}
  .artifact .pad blockquote{margin:16px 0}
  .decrypt-lede code{color:var(--sig);font-weight:600;word-break:break-all}

  /* ---- responsive ---- */
  @media (max-width:1199px){
    .feed-grid.wide{grid-template-columns:minmax(0,1fr)}
    .rail{display:none}
  }
  @media (max-width:1099px){
    .dgrid,.etchgrid,.about-grid{grid-template-columns:minmax(0,1fr)}
    .hero{grid-template-columns:minmax(0,1fr)}
    .hero h1{font-size:60px}
    .sticky{position:static}
    .art-grid{grid-template-columns:minmax(0,1fr)}
    .art-toc{position:static}
  }
  @media (max-width:759px){
    .shell{grid-template-columns:minmax(0,1fr)}
    .side{display:none}
    .mtop{display:block}
    .mctl{display:flex}
    .mctl[hidden]{display:none}
    .tabbar{display:grid}
    .stage{padding-bottom:calc(72px + env(safe-area-inset-bottom))}
    .page,.wrap{padding:14px 12px;gap:14px}
    .title,.page-title{font-size:26px}
    .phead .sorttabs{display:none}
    .row{padding:16px}
    .row .meta{flex-wrap:wrap;row-gap:4px}
    .row .meta .when{flex:0 0 auto}
    .row .foot{flex-wrap:wrap;row-gap:8px}
    .row .content{font-size:17px}
    .vg button{padding:10px 12px}
    .vg.big button{padding:11px 12px}
    .artifact{box-shadow:none;padding:22px 18px}
    .artifact blockquote{font-size:28px}
    .artifact blockquote.med{font-size:22px}
    .artifact blockquote.long{font-size:17px}
    .artifact .acts .share{margin-left:0;width:100%}
    .trow.cols{grid-template-columns:minmax(0,1fr) auto}
    .trow.cols .code{display:none}
    .trow.protos{grid-template-columns:minmax(0,1fr) 70px}
    .trow.protos .share{display:none}
    .turn{max-width:90%}
    .keb-body{grid-template-columns:1fr}
    .keb-divider{display:none}
    .art-grid{grid-template-columns:minmax(0,1fr)}
    .art-toc{display:none}
    .art-title{font-size:28px}
    .answer{box-shadow:none}
    .hero{padding:28px 16px;gap:28px}
    .hero h1{font-size:44px}
    .hero .btn{padding:13px 20px;font-size:15px}
    .about-sec{padding:28px 16px}
    .hero-title{font-size:40px}
    .col-card{grid-template-columns:minmax(0,1fr) auto}
    .col-card .top{display:none}
  }
</style>
</head>
<body>
<div class="shell">
${sidebarHtml(s)}
<div class="stage">
  <div class="mtop"><div class="mbar"><a class="brandm" href="/">OP_RETURN</a><div class="right"><button class="themebtn" data-action="theme" type="button">&#9790; Dark</button><span class="tip">&#9679; <span data-tip>${s.tip ? '#' + s.tip.toLocaleString('en-US') : '&mdash;'}</span></span></div></div><div class="mctl" id="mfeedctl" hidden></div></div>
  <div id="app">${m.initialHtml || ''}</div>
</div>
</div>
${tabbarHtml()}

<div class="sheet-scrim" id="sheet" hidden>
  <div class="sheet" role="dialog" aria-label="Filter">
    <div class="sh"><b>Filter</b><a class="clearall" href="/feed">RESET</a></div>
    <div class="sb" id="sheet-body"></div>
    <div class="sf"><button class="btn btn-primary" data-action="sheet-close" type="button">Show <span id="sheet-count">0</span> messages</button></div>
  </div>
</div>

<div class="scrim" id="suggest-modal" hidden>
  <div class="modal" role="dialog" aria-label="Suggest an address">
    <div class="modal-head"><span>&#9670; SUGGEST AN ADDRESS</span><button class="modal-x" data-action="suggest-close" aria-label="close" type="button">&#10005;</button></div>
    <div class="modal-body">
      <p class="modal-lede">Know a Bitcoin address collecting strange OP_RETURN messages? Suggest it. Every submission is reviewed by a human before it's monitored.</p>
      <label class="fld"><span>Bitcoin address</span><input id="sug-addr" placeholder="bc1&hellip; / 1&hellip; / 3&hellip;" autocomplete="off" spellcheck="false" /><span class="modal-msg" id="sug-msg"></span></label>
      <div class="fld"><span>Collection</span><div class="chips" id="sug-cols"></div><input type="hidden" id="sug-col" /></div>
      <label class="fld"><span>Why this address? (optional)</span><textarea id="sug-note" rows="2" maxlength="280" placeholder="What's showing up there?"></textarea></label>
    </div>
    <div class="modal-foot"><button class="btn" data-action="suggest-close" type="button">Cancel</button><button class="btn btn-primary" id="sug-submit" data-action="suggest-submit" type="button">Submit suggestion</button></div>
  </div>
</div>

<div class="scrim" id="decrypt-modal" hidden>
  <div class="modal">
    <div class="modal-head"><span>&#9670; DECRYPT ELECTRUM BIE1 PAYLOAD</span><button class="modal-x" data-action="decrypt-close" aria-label="close">&#10005;</button></div>
    <div class="modal-body">
      <p class="modal-lede">Payload encrypted with <strong>Electrum BIE1 ECIES</strong> to Bitcoin key for:<br><code id="dec-target-addr" style="color:var(--sig);font-weight:600;word-break:break-all"></code></p>
      <div style="background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.28);padding:9px 12px;font-size:12px;color:var(--fg2);margin-bottom:14px">
        <strong style="color:#16a34a">&#128274; 100% Client-Side Decryption:</strong> Computed locally in your browser using secp256k1 &amp; WebCrypto. Your key never leaves this tab.
      </div>
      <label class="fld">
        <span>Bitcoin Private Key (WIF or 64-hex)</span>
        <div style="display:flex;gap:0">
          <input id="dec-privkey" type="password" placeholder="e.g. L... or 64-character hex" autocomplete="off" spellcheck="false" />
          <button type="button" class="btn-sm" id="dec-toggle-pwd" style="border-left:none" title="Toggle visibility">&#128065;</button>
        </div>
      </label>
      <input type="hidden" id="dec-payload" />
      <input type="hidden" id="dec-target-txid" />
      <div class="modal-msg" id="dec-msg"></div>
      <div id="dec-result" style="display:none;margin-top:14px">
        <div style="font-family:'Martian Mono',monospace;font-size:11px;color:#16a34a;font-weight:600;margin-bottom:6px">&#128275; DECRYPTED PLAINTEXT:</div>
        <div id="dec-plaintext" style="background:var(--bg);border:1px solid #16a34a;padding:12px;font-family:'Martian Mono',monospace;font-size:13px;white-space:pre-wrap;word-break:break-word;user-select:all"></div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn" data-action="decrypt-close">Close</button>
      <button class="btn btn-primary" id="dec-submit" data-action="decrypt-submit">Decrypt message</button>
    </div>
  </div>
</div>


<script>
(function(){
  var state={screen:'feed',filter:null,address:null,category:null,protocol:null,tick:null,block:null,kind:'text',q:'',sort:'new',
    liked:{},voted:{},mining:{},collections:[],categories:[],protocols:[],ticks:[],chain:null,feed:[],nextBefore:null,feedError:null,
    detailTx:null,cache:{},related:[],chat:{messages:[],participants:[],nextBefore:null},chatScroll:null,
    newBlock:null,watermark:null,blockRow:null,etch:'gm, permanent record',stepOpen:{0:true},faqOpen:{0:true},sheet:false};
  var POW_BITS=16;
  var _inApp=0;
  try{state.liked=JSON.parse(localStorage.getItem('opreturn_liked')||'{}');}catch(e){}
  try{state.voted=JSON.parse(localStorage.getItem('opreturn_voted')||'{}');}catch(e){}
  for(var _k in state.liked){if(state.liked[_k]&&!state.voted[_k])state.voted[_k]='up';}

  var app=document.getElementById('app');
  var HOSTILE={'Prompt Injection':1,'Threats / Hostility':1,'Laundry / Service Ads':1};

  /* ---- helpers ---- */
  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
  function attr(s){return esc(s);}
  function fmt(n){return Number(n||0).toLocaleString('en-US');}
  function shortAddr(a){a=String(a||'');return a.length>16?a.slice(0,10)+'…'+a.slice(-4):a;}
  function catCode(c){return 'COL-'+('0'+c).slice(-2);}
  function timeAgo(ts){if(ts==null||ts==='')return '';var ms=typeof ts==='number'?ts*1000:new Date(String(ts).replace(' ','T')+(String(ts).indexOf('Z')<0?'Z':'')).getTime();if(isNaN(ms))return '';var diff=(Date.now()-ms)/60000;if(diff<1)return 'just now';if(diff<60)return Math.floor(diff)+'m ago';if(diff<1440)return Math.floor(diff/60)+'h ago';return Math.floor(diff/1440)+'d ago';}
  function msgTime(m){return m.block_time!=null?m.block_time:m.created_at;}
  function tsOf(m){if(m.block_time!=null)return m.block_time;var t=new Date(String(m.created_at||'').replace(' ','T')+'Z').getTime();return isNaN(t)?0:Math.floor(t/1000);}
  function clock(ts){return new Date(ts*1000).toISOString().slice(11,16)+' UTC';}
  function dateOf(ts){return new Date(ts*1000).toISOString().slice(0,10);}
  function feeText(m){if(m.fee_rate!=null)return m.fee_rate+' sat/vB';if(m.fee_sats!=null)return fmt(m.fee_sats)+' sats';return '';}
  function whenText(m){if(m.is_mempool){var ago=timeAgo(m.created_at);return '◷ mempool · '+(ago==='just now'?'now':ago.replace(' ago',''));}return timeAgo(msgTime(m));}
  function fmtSats(n){if(n>=1e6)return (n/1e6).toFixed(2).replace(/\\.?0+$/,'')+'M';if(n>=1e4)return (n/1e3).toFixed(1).replace(/\\.0$/,'')+'K';return fmt(n);}
  function mid(s,n){s=String(s||'');if(s.length<=n)return s;var h=Math.max(6,Math.floor((n-3)/2));return s.slice(0,h)+'…'+s.slice(-h);}
  function cacheMsgs(list){list.forEach(function(m){state.cache[m.id]=m;if(m.txid)state.cache[m.txid]=m;});}
  function colName(cid){var c=colById(cid);return c?c.name:'';}
  function colById(cid){for(var i=0;i<state.collections.length;i++){if(state.collections[i].id===cid)return state.collections[i];}return null;}
  function colBySlug(s){for(var i=0;i<state.collections.length;i++){if(state.collections[i].slug&&state.collections[i].slug.toLowerCase()===String(s).toLowerCase())return state.collections[i];}return null;}
  function colSlug(c){return c&&(c.slug||String(c.id))||'';}
  function colIndex(id){for(var i=0;i<state.collections.length;i++){if(state.collections[i].id===id)return i;}return 0;}
  function shortCol(c){if(!c)return '';var n=String(c.name).replace(/ Bulletin Board$| Notices$| Marking Campaign$| & Digital Graffiti$/,'');if(/^Genesis/.test(n))n='Genesis tribute';if(/^Russian/.test(n))n='Russian intel marking';return n.length>28?n.slice(0,26)+'…':n;}
  function catSlug(c){return String(c||'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').replace(/--+/g,'-');}
  function catName(slug){for(var i=0;i<state.categories.length;i++){if(catSlug(state.categories[i].category)===String(slug).toLowerCase())return state.categories[i].category;}return null;}
  function catDot(c){return HOSTILE[c]?'sig':(c==='Other'||!c?'mute':'');}
  var PROTO_LABEL={text:'Message',binary:'Binary',runes:'Runes',omni:'Omni Layer',thorchain:'THORChain','bridge-memo':'Bridge memo','evm-hash':'EVM hash','witness-commitment':'Witness commitment',rootstock:'Rootstock','core-dao':'Core DAO',exsat:'exSat',stacks:'Stacks',syscoin:'Syscoin',lifi:'LI.FI','data-uri':'Inline file',nft:'NFT',satflow:'SATFLOW','brc20-prog':'BRC20PROG',dio:'DIO',alpn:'ALPN'};
  var PROTO_BLURB={'ico-20':'JSON token operations such as the $LEAF mints sent to the Genesis address.','crc-20':'JSON token operations such as the $LEAF mints sent to the Genesis address.','brc-20':'JSON token operations.',omni:'Omni Layer transfers, mostly Tether (USDT) simple sends.',thorchain:'THORChain outbound (OUT:) and refund memos plus swap instructions.','bridge-memo':'Cross-chain bridge memos naming the destination asset and address.','evm-hash':'Bare 32-byte EVM transaction or commitment hashes.',lifi:'LI.FI bridge routing markers.',rootstock:'Rootstock merge-mining commitments (RSKBLOCK:).',stacks:'Stacks block commits, leader keys and STX operations.','core-dao':'Core DAO validator delegation tags.',exsat:'exSat data-availability tags.',syscoin:'Syscoin merge-mining commitments.',satflow:'Bare protocol marker with no readable payload.','brc20-prog':'Bare protocol marker with no readable payload.',dio:'Bare protocol marker with no readable payload.',alpn:'Bare protocol marker with no readable payload.','data-uri':'Files etched as data: URIs, rendered inline when they are images.',nft:'JSON NFT mints and transfers.'};
  var TOKEN_PROTO=/-20$|^src-|^orc-|^brc|^drc-|^ltc-|^nft$/;
  function protoLabel(p){p=String(p||'');return PROTO_LABEL[p]||p.toUpperCase();}
  function protoBlurb(p){return PROTO_BLURB[p]||(/-20$/.test(p)?'JSON token operations.':'Structured protocol data decoded from the OP_RETURN payload.');}
  function isTokenProto(p){return TOKEN_PROTO.test(String(p||''));}
  function isProto(m){return !!(m&&m.protocol&&m.protocol!=='text');}
  function fmtAmt(a){if(a==null||a==='')return '';var n=Number(a);if(!isFinite(n))return String(a);if(Math.abs(n)>=1)return n.toLocaleString('en-US',{maximumFractionDigits:8});return String(a);}
  function primaryOp(m){
    if(!isProto(m))return null;
    var ops=m.ops;
    if(!ops){ops=[];String(m.content||'').split('\\n').forEach(function(line,i){line=line.trim();if(line.charAt(0)!=='{')return;try{var j=JSON.parse(line);if(j&&typeof j.p==='string')ops.push({vout:i,protocol:String(j.p).toLowerCase(),op:j.op||null,tick:j.tick||j.name||null,amount:j.amt||j.amount||null});}catch(e){}});}
    for(var i=0;i<ops.length;i++){if(ops[i].protocol===m.protocol)return ops[i];}
    return ops[0]||{protocol:m.protocol,op:null,tick:null,amount:null};
  }
  var RE_DATA_IMG=/^data:image\\/(png|jpeg|jpg|gif|webp|svg\\+xml|bmp|avif);base64,[A-Za-z0-9+\\/=\\s]+$/;
  var RE_DATA_ANY=/^data:([a-z0-9.+-]+\\/[a-z0-9.+-]+)(?:;[a-z0-9=.-]+)*(?:;base64)?,/i;
  function splitMedia(content){
    var lines=String(content||'').split('\\n'),text=[],images=[],files=[];
    lines.forEach(function(l){var t=l.trim();var m=RE_DATA_ANY.exec(t);
      if(!m){text.push(l);return;}
      if(RE_DATA_IMG.test(t))images.push(t.replace(/\\s+/g,''));else files.push(m[1]+' · '+Math.round(t.length*3/4/1024*10)/10+' KB');});
    return {text:text.join('\\n').trim(),images:images,files:files};
  }
  function mediaHTML(media){
    var h='';
    media.images.forEach(function(src){h+='<div class="inline-media"><img src="'+attr(src)+'" alt="Image etched into an OP_RETURN output" loading="lazy" decoding="async"></div>';});
    media.files.forEach(function(f){h+='<div class="inline-media file">📎 inline file · '+esc(f)+'</div>';});
    return h;
  }
  function displayText(m){var media=splitMedia(m.content);var env=parseCryptoEnvelope(m.content);var t=media.images.length||media.files.length?(media.text||'[inline file]'):(m.content||'');if(env&&env.leadText)t=env.leadText;else if(env&&env.type==='bie1')t='[Electrum BIE1 ECIES encrypted payload to '+shortAddr(m.address)+']';else if(env&&env.type==='pgp-encrypted')t='[OpenPGP encrypted transmission to Blockstream Security]';return t;}
  function opLine(m){
    var o=primaryOp(m);if(!o)return '';
    var h='<div class="opline">';
    if(o.op)h+='<span>'+esc(String(o.op).toLowerCase())+'</span>';
    if(o.amount)h+='<span class="amt">'+esc(fmtAmt(o.amount))+'</span>';
    if(o.tick)h+='<a class="tk" href="/tick/'+encodeURIComponent(o.tick)+'">$'+esc(o.tick)+'</a>';
    var to=m.recipient||(m.monitored_address&&m.monitored_address!==m.sender?m.monitored_address:null);
    if(to)h+='<span class="arrow">→</span><a href="/a/'+attr(to)+'">'+esc(shortAddr(to))+'</a>';
    h+='</div>';
    return h;
  }
  function envBadges(m){var env=parseCryptoEnvelope(m.content);if(!env)return '';if(env.isSigned)return '<span class="badge" style="color:var(--green)">🛡 PGP SIGNED</span>';if(env.type==='bie1')return '<span class="badge" style="color:var(--amber)">⚡ BIE1 ECIES</span>';if(env.type==='pgp-encrypted')return '<span class="badge" style="color:#3d6e8f">🔒 PGP ENCRYPTED</span>';return '';}
  function voteGroup(m,big){
    var voted=state.voted[m.id]||(state.liked[m.id]?'up':null);
    var h='<span class="vg'+(big?' big':'')+'">';
    h+='<button class="up'+(voted==='up'?' voted':'')+'" data-action="vote" data-dir="up" data-id="'+m.id+'" title="Upvote (mines a proof-of-work nonce)">▲'+(big?' Upvote':'')+'</button>';
    h+='<span class="score'+(voted?' voted':'')+'" data-lc="'+m.id+'">'+fmt(m.likes||0)+'</span>';
    h+='<button class="down'+(voted==='down'?' voted':'')+'" data-action="vote" data-dir="down" data-id="'+m.id+'" title="Downvote">▼</button></span>';
    return h;
  }

  /* ---- data ---- */
  function fetchJSON(u,o){return fetch(u,o).then(function(r){return r.json().then(function(d){return {status:r.status,d:d};});});}
  function loadCollections(){return fetchJSON('/api/collections').then(function(r){state.collections=Array.isArray(r.d)?r.d:[];}).catch(function(){});}
  function loadCategories(){return fetchJSON('/api/categories').then(function(r){state.categories=Array.isArray(r.d)?r.d:[];}).catch(function(){});}
  function loadProtocols(){return fetchJSON('/api/protocols').then(function(r){state.protocols=(Array.isArray(r.d)?r.d:[]).filter(function(p){return p.protocol!=='text';});}).catch(function(){});}
  function loadTicks(q){return fetchJSON('/api/ticks?limit=40'+(q||'')).then(function(r){state.ticks=Array.isArray(r.d)?r.d:[];}).catch(function(){});}
  function loadChain(){return fetchJSON('/api/chain').then(function(r){state.chain=r.d&&r.d.blocks!=null?r.d:null;}).catch(function(){});}
  function feedQuery(limit,before){
    var q='/api/messages?sort='+state.sort+'&limit='+(limit||50);
    if(state.filter)q+='&collection_id='+state.filter;
    if(state.address)q+='&address='+encodeURIComponent(state.address);
    if(state.category)q+='&category='+encodeURIComponent(catSlug(state.category));
    if(state.protocol)q+='&protocol='+encodeURIComponent(state.protocol);
    if(state.tick)q+='&tick='+encodeURIComponent(state.tick);
    if(state.block)q+='&block='+state.block;
    if(state.kind==='all')q+='&kind=all';
    if(before)q+='&before='+encodeURIComponent(before);
    return q;
  }
  function loadFeed(append){
    return fetchJSON(feedQuery(50,append?state.nextBefore:null)).then(function(r){
      var msgs=(r.d&&r.d.messages)||[];cacheMsgs(msgs);
      state.feed=append?state.feed.concat(msgs):msgs;
      state.nextBefore=r.d?r.d.next_before:null;
      state.feedError=r.status>=400?('feed unavailable (HTTP '+r.status+')'):null;
      if(!append)setWatermark();
    }).catch(function(){state.feedError='feed unavailable';if(!append){state.feed=[];state.nextBefore=null;}});
  }
  function setWatermark(){var best=null;state.feed.forEach(function(m){var t=tsOf(m);if(!best||t>best.ts||(t===best.ts&&m.id>best.id))best={ts:t,id:m.id};});state.watermark=best;state.newBlock=null;}
  var _chatSeq=0;
  function resetChat(){state.chat={messages:[],participants:[],nextBefore:null};_chatSeq++;}
  function loadChat(prepend){
    var seq=++_chatSeq;
    var q='/api/chat?limit=200';
    if(state.filter)q+='&collection_id='+state.filter;
    if(state.address)q+='&address='+encodeURIComponent(state.address);
    if(prepend&&state.chat.nextBefore)q+='&before='+encodeURIComponent(state.chat.nextBefore);
    return fetchJSON(q).then(function(r){
      if(seq!==_chatSeq)return;
      var d=r.d||{};var msgs=d.messages||[];cacheMsgs(msgs);
      state.chat.messages=prepend?msgs.concat(state.chat.messages):msgs;
      state.chat.participants=d.participants||state.chat.participants||[];
      state.chat.nextBefore=d.next_before||null;
    }).catch(function(){});
  }
  function loadRelated(m){
    var q='/api/messages?sort=new&limit=6&kind=all&'+(m.collection_id?'collection_id='+m.collection_id:'address='+encodeURIComponent(m.address));
    return fetchJSON(q).then(function(r){state.related=((r.d&&r.d.messages)||[]).filter(function(x){return x.txid!==m.txid;}).slice(0,5);cacheMsgs(state.related);}).catch(function(){state.related=[];});
  }
  function loadBlock(h){return fetchJSON('/api/block/'+h).then(function(r){state.blockRow=r.status===200?r.d:null;}).catch(function(){state.blockRow=null;});}
  function ensureDetail(){var tx=state.detailTx;if(state.cache[tx]&&state.cache[tx].ops)return Promise.resolve();return fetchJSON('/api/message/'+tx).then(function(r){if(r.status===200&&r.d&&r.d.id)cacheMsgs([r.d]);});}

  /* ---- shell sync: sidebar, mobile controls, tab bar ---- */
  function isFeedScreen(){return state.screen==='feed';}
  function feedFilters(){
    var f=[];
    if(state.filter)f.push({label:shortCol(colById(state.filter)),href:'/feed'+(state.kind==='all'?'?kind=all':'')});
    if(state.category)f.push({label:state.category,href:'/feed'});
    if(state.protocol)f.push({label:'Protocol: '+state.protocol,href:'/feed?kind=all'});
    if(state.tick)f.push({label:'$'+state.tick,href:'/feed?kind=all'});
    if(state.block)f.push({label:'Block #'+fmt(state.block),href:'/feed?kind=all'});
    if(state.address)f.push({label:shortAddr(state.address),href:'/feed'});
    if(state.q)f.push({label:'“'+state.q+'”',href:location.pathname+(state.kind==='all'?'?kind=all':'')});
    return f;
  }
  function navKey(){var s=state.screen;if(s==='feed'||s==='detail')return 'feed';if(s==='chat')return 'rooms';if(s==='etch')return 'guide';return s;}
  function syncShell(){
    var key=navKey();
    var nav=document.querySelectorAll('[data-nav]');
    for(var i=0;i<nav.length;i++){nav[i].classList.toggle('active',nav[i].getAttribute('data-nav')===key);}
    var counts={feed:state.chain&&state.chain.stored_txs?fmt(state.chain.stored_txs):fmt(state.collections.reduce(function(t,c){return t+(c.message_count||0);},0)),rooms:String(state.collections.length),protocols:String(state.protocols.length),collections:String(state.collections.length)};
    for(var k in counts){var el=document.querySelector('[data-count="'+k+'"]');if(el)el.textContent=counts[k];}
    var tip=state.chain&&state.chain.highest_height?fmt(state.chain.highest_height):null;
    var tips=document.querySelectorAll('[data-tip]');for(var j=0;j<tips.length;j++){tips[j].textContent=tip?'#'+tip:'—';}
    var sf=document.getElementById('side-filters');
    if(sf){sf.hidden=!isFeedScreen();if(isFeedScreen())sf.innerHTML=filtersHTML(false);}
    var mc=document.getElementById('mfeedctl');
    if(mc){mc.hidden=!isFeedScreen();if(isFeedScreen()){var n=feedFilters().length;mc.innerHTML='<div class="seg2"><a href="'+attr(sortHref('hot'))+'" class="'+(state.sort==='hot'?'active':'')+'">Hottest</a><a href="'+attr(sortHref('new'))+'" class="'+(state.sort==='new'?'active':'')+'">Newest</a></div><button class="fbtn" data-action="sheet-open">Filter'+(n?' · '+n:'')+'</button>';}}
    var q=document.getElementById('side-q');if(q&&q.value!==state.q&&document.activeElement!==q)q.value=state.q;
    var sheet=document.getElementById('sheet-body');if(sheet&&state.sheet)sheet.innerHTML=filtersHTML(true);
    var cnt=document.getElementById('sheet-count');if(cnt)cnt.textContent=String(state.feed.length);
  }
  function sortHref(s){var qs=new URLSearchParams(location.search);if(s===defaultSort(currentRoute()))qs.delete('sort');else qs.set('sort',s);var q=qs.toString();return location.pathname+(q?'?'+q:'');}
  function kindHref(kind){
    var qs=new URLSearchParams(location.search);if(kind==='all')qs.set('kind','all');else qs.delete('kind');
    var path=location.pathname;
    if(state.protocol||state.tick||state.block){path='/feed';}
    var q=qs.toString();return path+(q?'?'+q:'');
  }
  function withKind(path){return path+(state.kind==='all'?'?kind=all':'');}
  function filtersHTML(sheet){
    var h='';
    h+='<div class="sgroup"><span class="slabel">SHOW</span><div class="seg2"><a href="'+attr(kindHref('text'))+'" class="'+(state.kind!=='all'?'active':'')+'">Messages</a><a href="'+attr(kindHref('all'))+'" class="'+(state.kind==='all'?'active':'')+'">All protocols</a></div></div>';
    if(sheet){
      h+='<div class="grp"><span class="slabel">COLLECTION</span><div class="chips"><a class="chip'+(!state.filter?' active':'')+'" href="'+attr(withKind('/feed'))+'">All collections</a>';
      state.collections.forEach(function(c){h+='<a class="chip'+(state.filter===c.id?' active':'')+'" href="'+attr(withKind('/c/'+colSlug(c)))+'">'+esc(shortCol(c))+'</a>';});
      h+='</div></div>';
      h+='<div class="grp"><span class="slabel">CATEGORY</span><div class="chips">';
      state.categories.forEach(function(c){var a=state.category===c.category;h+='<a class="chip'+(a?' active':'')+'" href="'+attr(a?'/feed':'/cat/'+encodeURIComponent(catSlug(c.category)))+'"><span class="dot '+catDot(c.category)+'"></span>'+esc(c.category)+'</a>';});
      h+='</div></div>';
      return h;
    }
    var total=state.collections.reduce(function(t,c){return t+(c.message_count||0);},0);
    h+='<div class="sgroup"><span class="slabel">COLLECTION</span>';
    h+='<a class="srow'+(!state.filter&&!state.address?' active':'')+'" href="'+attr(withKind('/feed'))+'"><span class="nm">All collections</span><span class="n">'+fmt(total)+'</span></a>';
    state.collections.forEach(function(c){h+='<a class="srow'+(state.filter===c.id?' active':'')+'" href="'+attr(withKind('/c/'+colSlug(c)))+'" title="'+attr(c.name)+'"><span class="nm">'+esc(shortCol(c))+'</span><span class="n">'+fmt(c.message_count||0)+'</span></a>';});
    h+='</div>';
    if(state.categories.length){h+='<div class="sgroup"><span class="slabel">CATEGORY</span>';
      state.categories.forEach(function(c){var a=state.category===c.category;h+='<a class="srow cat'+(a?' active':'')+'" href="'+attr(a?'/feed':'/cat/'+encodeURIComponent(catSlug(c.category)))+'"><span class="dot '+catDot(c.category)+'"></span><span class="nm">'+esc(c.category)+'</span><span class="n">'+fmt(c.count||0)+'</span></a>';});
      h+='</div>';}
    return h;
  }

  /* ---- feed ---- */
  function rowHTML(m){
    var proto=isProto(m);var hostile=HOSTILE[m.category];
    var col=m.collection_id?colById(m.collection_id):null;
    var h='<article class="row" data-id="'+m.id+'"><div class="meta">';
    h+='<span class="dot '+(proto?'tok':catDot(m.category))+'"></span>';
    if(proto)h+='<a class="cat tok" href="/p/'+encodeURIComponent(m.protocol)+'">'+esc(protoLabel(m.protocol))+'</a>';
    else if(m.category)h+='<a class="cat'+(hostile?' sig':'')+'" href="/cat/'+encodeURIComponent(catSlug(m.category))+'">'+esc(m.category)+'</a>';
    else h+='<span class="cat">Unclassified</span>';
    h+='<span class="sep">·</span>';
    if(col)h+='<a class="col" href="'+attr(withKind('/c/'+colSlug(col)))+'">'+esc(shortCol(col))+'</a>';else h+='<span class="col">Unmonitored</span>';
    h+=envBadges(m);
    if(m.dup_count>1)h+='<span class="badge" title="Same message broadcast in '+m.dup_count+' transactions">×'+m.dup_count+'</span>';
    h+='<span class="when'+(m.is_mempool?' mem':'')+'">'+esc(whenText(m))+'</span></div>';
    if(proto)h+=opLine(m);
    var text=displayText(m);
    h+='<button class="content'+(proto?' proto':'')+'" data-action="open-msg" data-txid="'+attr(m.txid)+'">'+esc(text)+'</button>';
    if(text.length>420)h+='<span class="readmore">… read full message →</span>';
    h+=mediaHTML(splitMedia(m.content));
    h+='<div class="foot">'+voteGroup(m,false);
    h+='<span class="chain">'+(m.block_height!=null?'<a href="/block/'+m.block_height+'">#'+fmt(m.block_height)+'</a>':'unconfirmed')+' · <a href="/a/'+attr(m.address)+'">'+esc(shortAddr(m.address))+'</a>'+(feeText(m)?' · '+esc(feeText(m)):'')+'</span>';
    h+='<button class="open" data-action="open-msg" data-txid="'+attr(m.txid)+'">Open →</button></div></article>';
    return h;
  }
  function feedTitle(){
    if(state.address)return state.address;
    if(state.filter)return colName(state.filter);
    if(state.category)return state.category;
    if(state.protocol)return protoLabel(state.protocol);
    if(state.tick)return '$'+state.tick;
    if(state.block)return 'Block #'+fmt(state.block);
    return 'All transmissions';
  }
  function feedKicker(){
    var scope=state.kind==='all'||state.protocol||state.tick||state.block?'EVERY PROTOCOL':'HUMAN MESSAGES';
    if(state.protocol)return (isTokenProto(state.protocol)?'TOKEN PROTOCOL':'OP_RETURN PROTOCOL')+' · '+state.protocol.toUpperCase();
    if(state.tick)return 'TOKEN TICKER';
    if(state.block)return 'BLOCK CENSUS';
    if(state.address)return 'ADDRESS RECORD';
    return scope+' · '+(state.filter?catCode(colIndex(state.filter)+1):'ALL COLLECTIONS');
  }
  function filteredFeed(){var q=state.q.toLowerCase();if(!q)return state.feed;return state.feed.filter(function(m){return String(m.content||'').toLowerCase().indexOf(q)>=0||String(m.address||'').toLowerCase().indexOf(q)>=0||String(m.sender||'').toLowerCase().indexOf(q)>=0;});}
  function renderFeed(){
    var wide=!state.protocol&&!state.tick&&!state.block;
    var h='<div class="feed-grid'+(wide?' wide':'')+'"><main class="page">';
    h+='<div class="phead"><div class="tt"><span class="kicker">'+esc(feedKicker())+'</span><h2 class="title page-title">'+esc(feedTitle())+'</h2>'+(state.protocol?'<p class="lede">'+esc(protoBlurb(state.protocol))+'</p>':'')+'</div>';
    h+='<div class="sorttabs"><a href="'+attr(sortHref('hot'))+'" class="'+(state.sort==='hot'?'active':'')+'">Hottest</a><a href="'+attr(sortHref('new'))+'" class="'+(state.sort==='new'?'active':'')+'">Newest</a></div></div>';
    if(state.protocol)h+=protocolHeadHTML();
    if(state.tick)h+=tickHeadHTML();
    if(state.block)h+=blockHeadHTML();
    if(state.filter||state.address){var c=colById(state.filter);h+='<div class="pills"><a class="chip active" href="'+attr(state.address?'/a/'+encodeURIComponent(state.address)+'/chat':'/c/'+colSlug(c)+'/chat')+'">💬 Open chat room</a>'+(c&&c.description?'<span class="caption" style="flex:1;min-width:200px">'+esc(c.description)+'</span>':'')+'</div>';}
    var pills=feedFilters();
    if(pills.length){h+='<div class="pills">';pills.forEach(function(p){h+='<a class="pill" href="'+attr(p.href)+'">'+esc(p.label)+' <span class="x">✕</span></a>';});h+='<a class="clearall" href="/feed">CLEAR ALL</a>'+(state.q?'<span class="caption">search runs within the loaded messages</span>':'')+'</div>';}
    if(state.newBlock&&state.newBlock.rows.length){h+='<button class="newbar" data-action="reveal-new"><span class="l"><span class="d"></span>Block #'+fmt(state.newBlock.height)+' added '+state.newBlock.rows.length+' new message'+(state.newBlock.rows.length>1?'s':'')+'</span><span class="r">SHOW ↑</span></button>';}
    var list=filteredFeed();
    h+='<div class="list" id="feed-list">';
    if(!list.length)h+='<div class="empty">'+(state.feedError?esc(state.feedError)+' — retry in a moment.':(state.q?'No loaded messages match “'+esc(state.q)+'”.':'No messages match these filters.'))+'</div>';
    list.forEach(function(m){h+=rowHTML(m);});
    h+='</div>';
    if(state.nextBefore)h+='<button class="btn-more" data-action="more">Load more ↓</button>';
    h+='<div class="status" id="status"></div>';
    if(state.protocol)h+=protocolTailHTML();
    h+='</main>';
    if(wide)h+=railHTML();
    h+='</div>';
    app.innerHTML=h;
  }
  function railHTML(){
    var ch=state.chain;
    var h='<aside class="rail">';
    if(ch&&ch.blocks){
      var pct=ch.opreturn_outputs?Math.round(ch.runes_outputs/ch.opreturn_outputs*100):0;
      h+='<div class="grp"><span class="slabel">CHAIN CENSUS</span><div class="census">';
      h+='<div><span class="v">'+fmt(ch.blocks)+'</span><span class="l">Blocks scanned</span></div>';
      h+='<div><span class="v">'+(ch.opreturn_outputs>=1e6?(ch.opreturn_outputs/1e6).toFixed(2)+'M':fmt(ch.opreturn_outputs))+'</span><span class="l">OP_RETURN outputs</span></div>';
      h+='<div><span class="v">'+pct+'%</span><span class="l">Runes, counted only</span></div>';
      h+='<div><span class="v">'+state.protocols.length+'</span><span class="l">Protocols decoded</span></div>';
      h+='</div></div>';
      if(ch.recent&&ch.recent.length){h+='<div class="grp" style="gap:6px"><span class="slabel" style="margin-bottom:4px">LATEST BLOCKS</span>';
        ch.recent.slice(0,6).forEach(function(b){h+='<a class="blk" href="/block/'+b.height+'"><b>#'+fmt(b.height)+'</b><span>'+esc(timeAgo(b.time))+'</span><span style="color:var(--fg2)">'+(b.stored_count?b.stored_count+' msg'+(b.stored_count>1?'s':''):'—')+'</span></a>';});
        h+='</div>';}
    }
    if(state.categories.length){
      var tot=state.categories.reduce(function(t,c){return t+(c.count||0);},0)||1;
      h+='<div class="grp" style="gap:10px"><span class="slabel">WHAT THEY’RE SAYING</span>';
      state.categories.slice(0,6).forEach(function(c){var p=Math.round(c.count/tot*100);h+='<a class="mix" href="/cat/'+encodeURIComponent(catSlug(c.category))+'"><div class="t"><span>'+esc(c.category)+'</span><span>'+p+'%</span></div><div class="bar"><i class="'+(HOSTILE[c.category]?'sig':'')+'" style="width:'+p+'%"></i></div></a>';});
      h+='</div>';
    }
    h+='<button class="sugcard" data-action="suggest-open" data-col="'+(state.filter||'')+'"><b>Know an address collecting messages?</b><span>SUGGEST IT →</span></button>';
    h+='</aside>';
    return h;
  }
  function protocolHeadHTML(){
    var p=null;state.protocols.forEach(function(x){if(x.protocol===state.protocol)p=x;});
    var ticks=state.ticks.filter(function(t){return t.protocol===state.protocol;});
    var ops=0;state.feed.forEach(function(m){(m.ops||[]).forEach(function(o){if(o.protocol===state.protocol)ops++;});});
    var h='<div class="stats"><div class="stat"><span class="v">'+fmt(p?p.count:0)+'</span><span class="l">Transactions, all scanned blocks</span></div><div class="stat"><span class="v">'+fmt(ticks.length)+'</span><span class="l">Tickers seen</span></div><div class="stat"><span class="v">'+(state.feed.length?fmt(state.feed.length)+(state.nextBefore?'+':''):'0')+'</span><span class="l">Loaded below</span></div></div>';
    if(ticks.length){h+='<div class="sgroup"><span class="slabel">TICKERS ON '+esc(state.protocol.toUpperCase())+'</span><div class="chips">';ticks.forEach(function(t){h+='<a class="chip" href="/tick/'+encodeURIComponent(t.tick)+'">$'+esc(t.tick)+' <span style="opacity:.55">'+fmt(t.count)+'</span></a>';});h+='</div></div>';}
    return h;
  }
  function protocolTailHTML(){var ex=null;state.feed.forEach(function(m){if(!ex&&m.content)ex=m;});if(!ex)return '';return '<div class="sgroup"><span class="slabel">RAW EXAMPLE</span><div class="rawbox">'+esc(String(ex.content).slice(0,600))+'</div></div>';}
  function tickHeadHTML(){
    var mine=state.ticks.filter(function(t){return t.tick===state.tick;});
    var protos=mine.map(function(t){return t.protocol;});var total=mine.reduce(function(n,t){return n+t.count;},0);
    var first=null;state.feed.forEach(function(m){if(m.block_height!=null&&(first==null||m.block_height<first))first=m.block_height;});
    var h='<p class="lede">Token ticker'+(protos.length?' · '+esc(protos.map(protoLabel).join(', ')):'')+(first!=null?' · first seen block '+fmt(first)+' (of the loaded operations)':'')+'</p>';
    h+='<div class="stats"><div class="stat"><span class="v">'+fmt(total)+'</span><span class="l">Operations, all scanned blocks</span></div>';
    mine.forEach(function(t){h+='<a class="stat" href="/p/'+encodeURIComponent(t.protocol)+'"><span class="v">'+fmt(t.count)+'</span><span class="l">via '+esc(protoLabel(t.protocol))+'</span></a>';});
    h+='</div>';
    return h;
  }
  function blockHeadHTML(){
    var b=state.blockRow;var hh=state.block;
    var h='<div class="pills"><a class="chip" href="/block/'+(hh-1)+'">← #'+fmt(hh-1)+'</a><a class="chip" href="/block/'+(hh+1)+'">#'+fmt(hh+1)+' →</a><a class="chip" href="https://mempool.space/block/'+hh+'" target="_blank" rel="noopener">mempool.space ↗</a></div>';
    if(!b){return h+'<p class="lede">This block has not been scanned by the explorer yet.</p>';}
    h+='<p class="lede">Mined '+esc(new Date(b.time*1000).toUTCString().replace(' GMT',' UTC'))+' · '+fmt(b.tx_count)+' transactions · '+fmt(b.opreturn_count)+' OP_RETURN outputs</p>';
    var text=0,tok=0,other=0;state.feed.forEach(function(m){if(!isProto(m))text++;else if(isTokenProto(m.protocol))tok++;else other++;});
    var tot=b.opreturn_count||1;var parts=[['Runes',b.runes_count,'var(--chip)'],['Opaque',b.binary_count,'var(--line)'],['Protocols',Math.max(0,b.stored_count-text-tok),'var(--fg3)'],['Tokens',tok,'var(--tok)'],['Human messages',text,'var(--sig)']];
    h+='<div class="sgroup"><span class="slabel">WHAT THE '+fmt(b.opreturn_count)+' OUTPUTS CARRIED</span><div class="compbar">';
    parts.forEach(function(p){if(p[1]>0)h+='<i style="width:'+Math.max(0.5,p[1]/tot*100)+'%;background:'+p[2]+'" title="'+attr(p[0]+' '+fmt(p[1]))+'"></i>';});
    h+='</div><div class="legend">';parts.forEach(function(p){h+='<span><i style="background:'+p[2]+'"></i>'+esc(p[0])+' '+fmt(p[1])+(p[0]==='Runes'?' (counted only)':'')+'</span>';});h+='</div></div>';
    return h;
  }

  /* ---- new-block bar ---- */
  var _pollTimer=null;
  function pollNewBlocks(){
    if(!isFeedScreen()||document.visibilityState!=='visible'||feedFilters().length||!state.watermark)return;
    var prevTip=state.chain&&state.chain.highest_height;
    fetchJSON('/api/chain').then(function(r){
      if(!r.d||r.d.blocks==null)return;state.chain=r.d;
      if(!prevTip||r.d.highest_height<=prevTip)return;
      syncShell();
      return fetchJSON('/api/messages?sort=new&limit=50'+(state.kind==='all'?'&kind=all':'')).then(function(rr){
        var w=state.watermark;var have={};state.feed.forEach(function(m){have[m.id]=1;});
        var fresh=((rr.d&&rr.d.messages)||[]).filter(function(m){var t=tsOf(m);return !have[m.id]&&(t>w.ts||(t===w.ts&&m.id>w.id));});
        if(fresh.length){state.newBlock={height:r.d.highest_height,rows:fresh};if(isFeedScreen())render();}
      });
    }).catch(function(){});
  }
  function revealNew(){
    if(!state.newBlock)return;var have={};state.feed.forEach(function(m){have[m.id]=1;});
    var rows=state.newBlock.rows.filter(function(m){return !have[m.id];});cacheMsgs(rows);
    state.feed=rows.concat(state.feed);state.sort='new';state.newBlock=null;setWatermark();
    var qs=new URLSearchParams(location.search);qs.delete('sort');var q=qs.toString();history.replaceState({},'',location.pathname+(q?'?'+q:''));
    render();window.scrollTo(0,0);
  }

  /* ---- detail ---- */
  function factRow(k,v,copyable){return '<div class="f"><span class="k">'+esc(k)+'</span><span class="v">'+(copyable?'<button data-action="copy" data-copy="'+attr(v)+'" title="copy">'+esc(v)+'</button>':v)+'</span></div>';}
  function renderDetail(){
    var m=state.cache[state.detailTx];if(!m){renderNotFound();return;}
    var proto=isProto(m);var hostile=HOSTILE[m.category];var env=parseCryptoEnvelope(m.content);var media=splitMedia(m.content);
    var col=m.collection_id?colById(m.collection_id):null;
    var qtext=displayText(m);var qlen=qtext.length;var qcls=proto?'proto':(qlen>600?'long':(qlen>240?'med':''));
    var h='<main class="page"><button class="back" data-action="back">← Back to feed</button><div class="dgrid"><div class="dmain">';
    h+='<div class="artifact"><div class="meta"><span class="dot '+(proto?'tok':catDot(m.category))+'"></span>';
    h+=proto?'<a class="catl tok" href="/p/'+encodeURIComponent(m.protocol)+'">'+esc(protoLabel(m.protocol))+'</a>':(m.category?'<a class="catl'+(hostile?' sig':'')+'" href="/cat/'+encodeURIComponent(catSlug(m.category))+'">'+esc(m.category)+'</a>':'<span class="catl">Unclassified</span>');
    h+=envBadges(m);
    h+='<span class="st '+(m.is_mempool?'mem':'conf')+'">'+(m.is_mempool?'◷ IN MEMPOOL':'✓ CONFIRMED')+'</span></div>';
    if(env&&env.isSigned)h+='<div class="crypto-sig-badge"><span class="sig-icon">🛡️</span><span>Signed by <strong>'+esc(env.signer||'Blockstream Security')+'</strong></span><span>Key ID: <code>'+esc(env.signerKey||'4AC8CC886844A2D6')+'</code></span><a href="https://blockstream.com/pgp.txt" target="_blank" rel="noopener">pgp.txt ↗</a></div>';
    if(proto)h+=opLine(m);
    h+='<blockquote class="'+qcls+'">'+esc(qtext)+'</blockquote>';
    h+=mediaHTML(media);
    if(env){
      if(env.type==='bie1'){
        h+='<div class="crypto-envelope bie1" id="env-'+attr(m.txid)+'"><div class="env-head"><span class="env-icon">⚡</span><div class="env-info"><div class="env-title">Electrum BIE1 ECIES Encrypted</div><div class="env-sub">Recipient: <code>'+esc(m.address)+'</code> (secp256k1)</div></div></div>';
        h+='<div class="env-actions"><button class="env-btn decrypt-btn" data-action="open-decrypt" data-txid="'+attr(m.txid)+'" data-payload="'+attr(env.bie1Payload)+'" data-addr="'+attr(m.address)+'">🔑 Decrypt with Private Key</button><button class="env-btn" data-action="copy" data-copy="'+attr(env.bie1Payload)+'">📋 Copy Payload</button><button class="env-btn" data-action="toggle-armor" data-target="armor-det-'+attr(m.txid)+'">🔍 Raw Payload</button></div>';
        h+='<div class="env-decrypted" id="dec-'+attr(m.txid)+'" style="display:none"></div><div class="env-armor" id="armor-det-'+attr(m.txid)+'" style="display:none"><pre><code>'+esc(env.bie1Payload)+'</code></pre></div></div>';
      }else if(env.type==='pgp-encrypted'){
        h+='<div class="crypto-envelope pgp" id="env-'+attr(m.txid)+'"><div class="env-head"><span class="env-icon">🔒</span><div class="env-info"><div class="env-title">Encrypted for Blockstream Security</div><div class="env-sub">RSA-4096 Subkey: <code>BB332D31CBA44EDF</code></div></div></div>';
        h+='<div class="env-actions"><button class="env-btn" data-action="toggle-armor" data-target="armor-det-'+attr(m.txid)+'">🔍 Inspect PGP Armor</button><button class="env-btn" data-action="copy" data-copy="'+attr(env.pgpArmor||m.content)+'">📋 Copy PGP</button><a class="env-btn" href="https://blockstream.com/pgp.txt" target="_blank" rel="noopener">🔑 Public Key ↗</a></div>';
        h+='<div class="env-armor" id="armor-det-'+attr(m.txid)+'" style="display:none"><pre><code>'+esc(env.pgpArmor||m.content)+'</code></pre></div></div>';
      }else if(env.type==='pgp-signed'&&env.pgpArmor){
        h+='<div class="env-armor-toggle"><button class="env-text-btn" data-action="toggle-armor" data-target="armor-det-'+attr(m.txid)+'">🔍 Inspect raw PGP signature</button><div class="env-armor" id="armor-det-'+attr(m.txid)+'" style="display:none"><pre><code>'+esc(env.pgpArmor)+'</code></pre></div></div>';
      }
    }
    if(m.ops&&m.ops.length){h+='<div class="ops"><span class="slabel" style="padding:12px 0 4px">DECODED OP_RETURN OUTPUTS · '+m.ops.length+'</span>';
      m.ops.forEach(function(o){h+='<div class="op"><span>vout '+(o.vout<0?'?':o.vout)+'</span><a class="pl'+(isTokenProto(o.protocol)?' tok':'')+'" href="/p/'+encodeURIComponent(o.protocol)+'">'+esc(protoLabel(o.protocol))+'</a>'+(o.op?'<span>'+esc(o.op)+'</span>':'')+(o.amount?'<code>'+esc(fmtAmt(o.amount))+'</code>':'')+(o.tick?'<a href="/tick/'+encodeURIComponent(o.tick)+'" style="color:var(--tok);font-weight:600">$'+esc(o.tick)+'</a>':'')+(o.payload_hex?'<span class="hex">'+esc(o.payload_hex.length>200?o.payload_hex.slice(0,200)+'…':o.payload_hex)+'</span>':'')+'</div>';});
      h+='</div>';}
    h+='<div class="acts">'+voteGroup(m,true);
    h+='<a class="act" href="'+attr(col?'/c/'+colSlug(col)+'/chat':'/a/'+encodeURIComponent(m.address)+'/chat')+'">Open in chat room</a>';
    h+='<button class="share" data-action="share">Share card</button></div></div>';
    if(state.related.length){h+='<div class="more"><span class="slabel">MORE FROM '+esc((col?shortCol(col):shortAddr(m.address)).toUpperCase())+'</span>';
      state.related.forEach(function(r){h+='<a href="/m/'+attr(r.txid)+'"><span>'+esc(displayText(r).replace(/\\n+/g,' / '))+'</span><span>'+esc(timeAgo(msgTime(r)))+'</span></a>';});h+='</div>';}
    h+='<p class="caption">Etched into the Bitcoin blockchain. It cannot be deleted, edited, or taken down.</p>';
    h+='</div>';
    h+='<div class="facts"><span class="h">ON-CHAIN RECORD</span>';
    h+=factRow('TXID',m.txid,true);
    h+=factRow('BLOCK',m.block_height!=null?'<a href="/block/'+m.block_height+'">#'+fmt(m.block_height)+'</a>'+(m.block_time!=null?' · '+dateOf(m.block_time):''):(m.is_mempool?'unconfirmed (in mempool)':'—'));
    h+=factRow('FEE',(feeText(m)||'—')+(m.fee_sats!=null?' · '+fmtSats(m.fee_sats)+' sats <span id="feeusd" style="color:var(--fg4)"></span>':''));
    h+=factRow('ADDRESS',m.address,true);
    if(m.sender&&m.sender!==m.address)h+=factRow('SENDER',m.sender,true);
    if(m.recipient&&m.recipient!==m.address)h+=factRow('RECIPIENT',m.recipient,true);
    h+=factRow('COLLECTION',col?'<a href="/c/'+attr(colSlug(col))+'">'+esc(col.name)+'</a>':'—');
    h+=factRow('PROTOCOL',proto?'<a href="/p/'+encodeURIComponent(m.protocol)+'">'+esc(m.protocol)+'</a>':'text');
    h+=factRow('CATEGORY',proto?'—':(m.category?'<a href="/cat/'+encodeURIComponent(catSlug(m.category))+'">'+esc(m.category)+'</a> (AI)':'unclassified'));
    h+=factRow('SIZE',(function(){try{return new TextEncoder().encode(m.content||'').length+' bytes';}catch(e){return (m.content||'').length+' chars';}})());
    h+=factRow('TIME',esc(timeAgo(msgTime(m)))+(m.block_time!=null?' · '+clock(m.block_time):''));
    h+='<a class="ext" href="https://mempool.space/tx/'+attr(m.txid)+'" target="_blank" rel="noopener">VIEW ON MEMPOOL.SPACE ↗</a></div>';
    h+='</div></main>';
    app.innerHTML=h;
    if(m.fee_sats!=null)fillFeeUsd(m);
  }
  function fillFeeUsd(m){
    var ts=m.block_time!=null?m.block_time:Math.floor(Date.now()/1000);
    fetch('/api/price?ts='+ts).then(function(r){return r.json();}).then(function(d){
      var el=document.getElementById('feeusd');
      if(el&&d&&typeof d.usd==='number')el.textContent='≈ $'+(m.fee_sats/1e8*d.usd).toFixed(2);
    }).catch(function(){});
  }

  /* ---- collections & protocols ---- */
  function renderCollections(){
    var h='<main class="page"><div class="phead"><div class="tt"><span class="kicker">ARCHIVE INDEX</span><h2 class="title">Collections</h2><p class="lede">Addresses grouped by the phenomenon behind them. Each collection is a running record of a specific pattern we’ve watched unfold on-chain.</p></div><button class="btn btn-sm" data-action="suggest-open" data-col="">+ Suggest an address</button></div>';
    h+='<div class="table">';
    state.collections.forEach(function(c,i){
      h+='<a class="trow cols" href="/c/'+attr(colSlug(c))+'"><span class="code">'+catCode(i+1)+'</span><span class="nm"><b>'+esc(c.name)+(c.message_count>=100?'<span class="hot">▲ HOT</span>':'')+'</b><span class="d">'+esc(c.description||'')+'</span></span><span class="cnt">'+fmt(c.message_count||0)+' msgs</span></a>';
    });
    if(!state.collections.length)h+='<div class="empty">No collections yet.</div>';
    h+='</div></main>';
    app.innerHTML=h;
  }
  function renderProtocols(){
    var ch=state.chain;var max=state.protocols.reduce(function(m,p){return Math.max(m,p.count);},1);
    var h='<main class="page"><div class="tt"><span class="kicker">PROTOCOL INDEX</span><h2 class="title">Protocols</h2><p class="lede" style="max-width:78ch">Every OP_RETURN output of every block is decoded before it reaches the feed. These are the protocols found in every scanned block; Runes and opaque payloads are counted per block but never shown.</p></div>';
    if(ch&&ch.blocks){var pct=ch.opreturn_outputs?Math.round(ch.runes_outputs/ch.opreturn_outputs*100):0;
      h+='<div class="stats"><div class="stat"><span class="v">'+fmt(ch.blocks)+'</span><span class="l">Blocks scanned</span></div><div class="stat"><span class="v">'+fmt(ch.opreturn_outputs)+'</span><span class="l">OP_RETURN outputs seen</span></div><div class="stat"><span class="v">'+pct+'%</span><span class="l">Runes (counted, not shown)</span></div><div class="stat"><span class="v">'+fmt(ch.stored_txs)+'</span><span class="l">Transactions decoded</span></div></div>';}
    h+='<div class="table">';
    state.protocols.forEach(function(p){
      h+='<a class="trow protos" href="/p/'+encodeURIComponent(p.protocol)+'"><span class="nm"><b>'+esc(p.label||protoLabel(p.protocol))+' <span class="id'+(isTokenProto(p.protocol)?' tok':'')+'">'+esc(p.protocol)+'</span></b><span class="d">'+esc(protoBlurb(p.protocol))+'</span></span><span class="cnt">'+fmt(p.count)+'</span><span class="share"><i style="width:'+Math.round(p.count/max*100)+'%"></i></span></a>';
    });
    if(!state.protocols.length)h+='<div class="empty">No protocol data yet — the scanner has not finished a block.</div>';
    h+='</div>';
    if(state.ticks.length){h+='<div class="sgroup"><span class="slabel">MOST ACTIVE TICKERS</span><div class="chips">';state.ticks.forEach(function(t){h+='<a class="chip" href="/tick/'+encodeURIComponent(t.tick)+'" title="'+attr(t.protocol)+'">$'+esc(t.tick)+' <span style="opacity:.55">'+fmt(t.count)+'</span></a>';});h+='</div></div>';}
    h+='</main>';
    app.innerHTML=h;
  }

  /* ---- chat rooms ---- */
  var AVCOL=['#d9481f','#b5851f','#5b7a4a','#3d6e8f','#7a4f9e','#a03c5c','#2f8a7d','#6b5b3e'];
  function hashStr(s){var h=7;s=String(s||'');for(var i=0;i<s.length;i++){h=((h*31)+s.charCodeAt(i))>>>0;}return h;}
  function avatarColor(a){return AVCOL[hashStr(a)%AVCOL.length];}
  function partyOf(addr){var ps=state.chat.participants||[];for(var i=0;i<ps.length;i++){if(ps[i].address===addr)return ps[i];}return null;}
  function shortLabel(l){return String(l||'').split(' (')[0];}
  function partyName(p,addr){return p&&p.label?shortLabel(p.label):shortAddr(addr);}
  function bubbleHTML(m,first,multi){
    var sender=m.sender||'';var party=sender?partyOf(sender):null;
    var name=sender?partyName(party,sender):'unknown sender';
    var color=party?'var(--sig)':avatarColor(sender||m.txid);
    var env=parseCryptoEnvelope(m.content);var bodyHTML='';
    if(env){
      if(env.isSigned)bodyHTML+='<div class="crypto-sig-badge"><span class="sig-icon">🛡️</span><span>Signed by <strong>'+esc(env.signer||'Blockstream Security')+'</strong></span><span>Key: <code>'+esc(env.signerKey||'4AC8CC886844A2D6')+'</code></span><a href="https://blockstream.com/pgp.txt" target="_blank" rel="noopener">pgp.txt ↗</a></div>';
      if(env.leadText){var ltext=env.leadText;var llong=ltext.length>520;if(llong)ltext=ltext.slice(0,480)+'…';bodyHTML+='<div class="bubble-text" data-action="open-msg" data-txid="'+attr(m.txid)+'">'+esc(ltext)+(llong?'<span class="readmore">read full message →</span>':'')+'</div>';}
      if(env.type==='bie1'){
        bodyHTML+='<div class="crypto-envelope bie1" id="env-'+attr(m.txid)+'"><div class="env-head"><span class="env-icon">⚡</span><div class="env-info"><div class="env-title">Electrum BIE1 ECIES Encrypted</div><div class="env-sub">Recipient: <code>'+esc(shortAddr(m.address))+'</code> (secp256k1)</div></div></div>';
        bodyHTML+='<div class="env-actions"><button class="env-btn decrypt-btn" data-action="open-decrypt" data-txid="'+attr(m.txid)+'" data-payload="'+attr(env.bie1Payload)+'" data-addr="'+attr(m.address)+'">🔑 Decrypt with Private Key</button><button class="env-btn" data-action="copy" data-copy="'+attr(env.bie1Payload)+'">📋 Copy Payload</button><button class="env-btn" data-action="toggle-armor" data-target="armor-'+attr(m.txid)+'">🔍 Raw Payload</button></div>';
        bodyHTML+='<div class="env-decrypted" id="dec-'+attr(m.txid)+'" style="display:none"></div><div class="env-armor" id="armor-'+attr(m.txid)+'" style="display:none"><pre><code>'+esc(env.bie1Payload)+'</code></pre></div></div>';
      }else if(env.type==='pgp-encrypted'){
        bodyHTML+='<div class="crypto-envelope pgp" id="env-'+attr(m.txid)+'"><div class="env-head"><span class="env-icon">🔒</span><div class="env-info"><div class="env-title">Encrypted for Blockstream Security</div><div class="env-sub">RSA-4096 Subkey: <code>BB332D31CBA44EDF</code></div></div></div>';
        bodyHTML+='<div class="env-actions"><button class="env-btn" data-action="toggle-armor" data-target="armor-'+attr(m.txid)+'">🔍 Inspect PGP Armor</button><button class="env-btn" data-action="copy" data-copy="'+attr(env.pgpArmor||m.content)+'">📋 Copy PGP</button><a class="env-btn" href="https://blockstream.com/pgp.txt" target="_blank" rel="noopener">🔑 Public Key ↗</a></div>';
        bodyHTML+='<div class="env-armor" id="armor-'+attr(m.txid)+'" style="display:none"><pre><code>'+esc(env.pgpArmor||m.content)+'</code></pre></div></div>';
      }else if(env.type==='pgp-signed'&&env.pgpArmor){
        bodyHTML+='<div class="env-armor-toggle"><button class="env-text-btn" data-action="toggle-armor" data-target="armor-'+attr(m.txid)+'">🔍 Inspect raw PGP signature</button><div class="env-armor" id="armor-'+attr(m.txid)+'" style="display:none"><pre><code>'+esc(env.pgpArmor)+'</code></pre></div></div>';
      }
    }else{
      var text=displayText(m);var long=text.length>520;if(long)text=text.slice(0,480)+'…';
      bodyHTML='<div class="bubble-text" data-action="open-msg" data-txid="'+attr(m.txid)+'">'+esc(text)+(long?'<span class="readmore">read full message →</span>':'')+'</div>'+mediaHTML(splitMedia(m.content));
    }
    var h='<div class="turn'+(party?' party':'')+'">';
    if(first){h+='<div class="who-line" style="color:'+color+'"><span>'+esc(name)+'</span>';if(multi&&m.address!==sender)h+='<span class="to">→ '+esc(partyName(partyOf(m.address),m.address))+'</span>';h+='</div>';}
    h+='<div class="bubble'+(m.is_mempool?' mem':'')+'">'+bodyHTML+'</div>';
    h+='<div class="bubble-meta">'+voteGroup(m,false);
    if(m.category)h+='<span class="cat'+(HOSTILE[m.category]?' sig':'')+'">'+esc(m.category)+'</span>';
    if(m.is_mempool)h+='<span class="st mem">◷ in mempool</span>';
    if(m.dup_count>1)h+='<span title="Same message broadcast in '+m.dup_count+' separate transactions">×'+m.dup_count+' txs</span>';
    h+='<span>'+esc(clock(tsOf(m)))+'</span></div></div>';
    return h;
  }
  function renderChat(){
    var col=state.filter?colById(state.filter):null;
    var title=state.address?state.address:(col?col.name:'Chat rooms');
    var h='<main class="page narrow"><div class="tt"><span class="kicker">CHAT ROOM · OLDEST TO NEWEST</span><h2 class="title page-title">'+esc(title)+'</h2></div>';
    h+='<div class="chips">';state.collections.forEach(function(c){h+='<a class="chip'+(state.filter===c.id?' active':'')+'" href="/c/'+attr(colSlug(c))+'/chat">'+esc(shortCol(c))+'</a>';});h+='</div>';
    var msgs=state.chat.messages;
    if(msgs.some(function(m){return parseCryptoEnvelope(m.content);})){
      h+='<div class="keb" id="keb"><button class="keb-head" data-action="keb-toggle"><span>🔐</span><span>CRYPTOGRAPHIC KEY EXCHANGE ACTIVE</span><span class="keb-badge">On-Chain PGP / ECIES</span><span style="margin-left:8px">▾</span></button><div class="keb-body">';
      h+='<div class="keb-party"><div class="keb-role">RESPONDER / PROTOCOL DEFENSE</div><div class="keb-name">Blockstream Security Reporting</div><div class="keb-key"><span>PGP Signing Key: <code>4AC8CC886844A2D6</code></span><span>Encryption Subkey: <code>BB332D31CBA44EDF</code> (RSA-4096)</span></div><div class="keb-fp">Fingerprint: <code>1176 542D A98E 71E1 3372 2EF7 4AC8 CC88 6844 A2D6</code></div><div class="keb-links"><a href="https://blockstream.com/pgp.txt" target="_blank" rel="noopener">Download pgp.txt ↗</a><a href="https://keyserver.ubuntu.com/pks/lookup?search=0x1176542DA98E71E133722EF74AC8CC886844A2D6&fingerprint=on&op=index" target="_blank" rel="noopener">Ubuntu Keyserver ↗</a></div></div>';
      h+='<div class="keb-divider">⇄</div>';
      h+='<div class="keb-party"><div class="keb-role">CALLER / WHITEHAT HOLDING</div><div class="keb-name">Peg-Out Auditor Address</div><div class="keb-key"><span>Bitcoin Address: <code>bc1ql4mfu...jlte</code></span><span>Scheme: <strong>Electrum BIE1 ECIES</strong> (secp256k1)</span></div><div class="keb-desc">Blockstream encrypts payloads to the whitehat using Bitcoin secp256k1 ECDH + AES-128-CBC + HMAC-SHA256. The whitehat replies using Blockstream’s RSA-4096 PGP subkey.</div><div class="keb-links"><a href="/a/bc1ql4mfu6aundtkksxklfajs2h3t9nzcd6gyqjlte/chat">Filter Whitehat Chat ↗</a></div></div>';
      h+='</div></div>';
    }
    var parts=state.chat.participants||[];var multi=parts.length>1;
    h+='<div class="room" id="room-log">';
    if(state.chat.nextBefore)h+='<button class="btn-more" data-action="chat-earlier">↑ Load earlier</button>';
    if(!msgs.length)h+='<span class="empty" style="padding:30px 0">No messages in this room yet.</span>';
    var lastDay='',lastSender=null,lastTs=0;
    msgs.forEach(function(m){var ts=tsOf(m);var day=dateOf(ts);if(day!==lastDay){h+='<div class="day">'+day+'</div>';lastDay=day;lastSender=null;}var sender=m.sender||'';var first=sender!==lastSender||ts-lastTs>600;h+=bubbleHTML(m,first,multi);lastSender=sender;lastTs=ts;});
    h+='</div>';
    h+='<div class="roomfoot"><span>New replies land with each block · <button class="clearall" data-action="share-room" style="padding:0">SHARE ROOM ↗</button></span><a class="etch" href="/guide">ETCH A REPLY →</a></div>';
    h+='<p class="caption">Every bubble is an OP_RETURN output etched into Bitcoin. Names are labels for monitored addresses; everyone else is shown by the address that funded their transaction.</p></main>';
    app.innerHTML=h;
    var sc=state.chatScroll;state.chatScroll=null;var de=document.documentElement;
    if(sc&&sc.keep!=null){window.scrollTo(0,de.scrollHeight-sc.keep);}
    else{var foot=document.querySelector('.roomfoot');if(foot&&msgs.length)window.scrollTo(0,foot.getBoundingClientRect().top+window.scrollY-window.innerHeight+foot.offsetHeight+8);}
  }

  /* ---- etch ---- */
  var STEPS=[
    ['01','Understand the tradeoff','OP_RETURN attaches data to a provably-unspendable output. Bitcoin Core 30.0 (2025) raised the default data-carrier limit from 83 bytes to 100,000, so larger payloads and multiple OP_RETURN outputs now relay and confirm on nodes running default settings; that is policy, not consensus, and some nodes keep the old limit. It is cheap but not free \\u2014 you pay a fee that scales with size \\u2014 and it is immutable once mined.'],
    ['02','Use a wallet that supports it','Bitcoin Core via bitcoin-cli (example below), or Electrum, whose Send tab and console accept a script such as OP_RETURN <hex> in place of an address. Sparrow Wallet has no native OP_RETURN field yet (issue #97 is still open with a pull request pending) but can sign a PSBT built elsewhere. Custodial and exchange wallets will not let you.'],
    ['03','Write your message','Plain UTF-8 text. Default nodes now relay up to 100,000 bytes across all OP_RETURN outputs, but bigger data costs a higher fee and some nodes keep the old 83-byte limit \\u2014 keep it short for reliability, or split it across outputs. Then encode it to hex with the encoder on the right.'],
    ['04','Build the transaction','Add one OP_RETURN output carrying your data (0 sats) plus a change output back to yourself, and set a fee rate from mempool.space.'],
    ['05','Broadcast and wait','Sign, broadcast, and watch it hit the mempool. Once a block confirms it, it lives on-chain forever. Send it to an address we monitor and it shows up in the feed here.']
  ];
  var CLI_EXAMPLE="# Bitcoin Core — attach arbitrary data\\nDATA=$(printf 'gm, permanent record' | xxd -p -c 999)\\nbitcoin-cli -named createrawtransaction \\\\\\n  inputs='[{\\"txid\\":\\"<your-utxo>\\",\\"vout\\":0}]' \\\\\\n  outputs='[{\\"data\\":\\"'$DATA'\\"},{\\"<change-addr>\\":0.0009}]'\\n# then: signrawtransactionwithwallet + sendrawtransaction";
  function etchHex(){var b;try{b=new TextEncoder().encode(state.etch);}catch(e){b=[];}var hex='';for(var i=0;i<b.length;i++)hex+=b[i].toString(16).padStart(2,'0');return {bytes:b.length,hex:hex};}
  function renderEtch(){
    var e=etchHex();
    var h='<main class="page"><div class="etchgrid"><div style="display:flex;flex-direction:column;gap:20px;min-width:0">';
    h+='<div class="tt"><span class="kicker">FIELD MANUAL</span><h2 class="title" style="font-size:40px">Etch a message onto Bitcoin</h2><p class="lede" style="font-size:16px;max-width:62ch">An OP_RETURN output lets you attach a small piece of arbitrary data to a Bitcoin transaction. Miners record it in the blockchain like any other transaction — which means once it confirms, it is public and permanent.</p></div>';
    h+='<div class="steps">';
    STEPS.forEach(function(s,i){var open=!!state.stepOpen[i];h+='<button class="step'+(open?' open':'')+'" data-action="step-toggle" data-i="'+i+'"><span class="n">'+s[0]+'</span><span class="b"><span class="t">'+esc(s[1])+'<span class="sign">'+(open?'−':'+')+'</span></span><span class="body">'+esc(s[2])+(i===3?'<span class="code">'+esc(CLI_EXAMPLE)+'</span>':'')+'</span></span></button>';});
    h+='</div></div>';
    h+='<div class="sticky"><div class="callout"><span class="b">⚠ BEFORE YOU DO THIS</span><p>There is no undo. Anything you write is public forever, tied to your transaction, and costs a real fee. Never include anything private, illegal, or that identifies you unless you intend to.</p></div>';
    h+='<div class="encoder"><span class="h">ENCODE YOUR MESSAGE</span><div class="bd"><textarea id="etch-text" rows="3" placeholder="gm, permanent record">'+esc(state.etch)+'</textarea>';
    h+='<div class="meta"><span id="etch-bytes">'+e.bytes+' bytes</span><span id="etch-sats">≈ '+fmt(Math.round((e.bytes+232)*6))+' sats at 6 sat/vB</span></div>';
    h+='<div class="hex" id="etch-hex">'+esc(e.hex)+'</div><button class="btn" data-action="copy-hex">Copy hex</button></div></div>';
    h+='<p class="gnote">This tool only reads the chain — it never asks for your keys and cannot send anything for you. Step-by-step companion: <a href="/learn/how-to-etch-op-return">How to etch an OP_RETURN message</a>.</p></div></div></main>';
    app.innerHTML=h;
  }
  function updateEtch(){var e=etchHex();var b=document.getElementById('etch-bytes'),s=document.getElementById('etch-sats'),x=document.getElementById('etch-hex');if(b)b.textContent=e.bytes+' bytes';if(s)s.textContent='≈ '+fmt(Math.round((e.bytes+232)*6))+' sats at 6 sat/vB';if(x)x.textContent=e.hex;}

  /* ---- about ---- */
  var FAQ=[
    ['What is an OP_RETURN message in Bitcoin?','An OP_RETURN output is a Bitcoin Script opcode (0x6a) used to embed arbitrary data into a transaction. Because OP_RETURN outputs are provably unspendable, nodes exclude them from the RAM-resident UTXO set, making it the standard method for recording permanent, tamper-evident messages without blockchain bloat.'],
    ['Can an OP_RETURN message be deleted, altered, or censored?','No. Once a transaction carrying an OP_RETURN output is confirmed inside a Bitcoin block, it becomes an immutable part of the distributed ledger. It cannot be altered, edited, or removed by any central authority, corporation, or node operator.'],
    ['How much data can fit inside an OP_RETURN output?','Consensus sets no specific limit. Relay policy allowed about 40 bytes from 2014 and 80 bytes from 2015; Bitcoin Core 30.0 (October 2025) raised the default -datacarriersize to 100,000 bytes, effectively uncapping it, and began relaying multiple OP_RETURN outputs per transaction. Operators can restore the old limit with -datacarriersize=83. Fees are the practical constraint.'],
    ['What does The Permanent Record archive?','Every block is scanned and every OP_RETURN output is decoded: human messages, token protocols such as ico-20 and crc-20, bridge and sidechain markers, inline files. Curated collections follow high-profile addresses that turned into public bulletin boards: whitehat and hacker negotiations, dormant-wallet notices, Genesis block tributes.'],
    ['How does AI classification categorize transmissions?','Each human-readable message is processed through an OpenAI-compatible endpoint that classifies it into one of seven categories: Laundry / Service Ads, Begging / Victim Appeals, Threats / Hostility, Prompt Injection, Haiku / Philosophical, Self-deprecating / Black Humor, or Other. Protocol payloads are decoded, not classified.'],
    ['How can I etch my own message into Bitcoin?','Attach an OP_RETURN output with Bitcoin Core (createrawtransaction with a data output) or Electrum (a script such as OP_RETURN <hex> in the Send tab); Sparrow Wallet has no native field yet but can sign a PSBT built elsewhere. You pay a standard miner fee proportional to data size. Full instructions are in the field manual and the guide at /learn/how-to-etch-op-return.']
  ];
  function textFeed(){return Object.keys(state.cache).map(function(k){return state.cache[k];}).filter(function(m,i,a){return m&&m.txid&&!isProto(m)&&a.findIndex(function(x){return x.id===m.id;})===i;});}
  function renderAbout(){
    var all=textFeed();var live=all.slice().sort(function(a,b){return tsOf(b)-tsOf(a);}).slice(0,4);
    var feat=null;all.forEach(function(m){if(!feat||m.likes>feat.likes)feat=m;});
    var ch=state.chain;
    var h='<main><div class="hero"><div class="l">';
    h+='<span class="pill-live"><span class="d"></span>'+(ch&&ch.stored_txs?fmt(ch.stored_txs)+' OP_RETURN TXS DECODED':fmt(state.collections.reduce(function(t,c){return t+(c.message_count||0);},0))+' MESSAGES ARCHIVED')+' · UPDATING EVERY BLOCK</span>';
    h+='<h1>People are leaving messages inside Bitcoin. Forever.</h1>';
    h+='<p class="lede">Every one of these was etched into an OP_RETURN output on the blockchain — threats, confessions, prayers, ads, haiku. Immutable. Unstoppable. We scan every block, decode every OP_RETURN protocol, and keep the human messages front and centre.</p>';
    h+='<div class="cta"><a class="btn btn-primary" href="/feed">Enter the feed →</a><a class="btn" href="/guide">Etch your own</a><a class="btn" href="/learn">Read the guides</a></div></div>';
    h+='<div class="livepanel"><span class="h">● LIVE FROM THE CHAIN</span>';
    if(!live.length)h+='<a href="/feed"><span class="k">waiting for the next block</span><span class="c">The feed fills in as blocks arrive.</span></a>';
    live.forEach(function(m){h+='<a href="/m/'+attr(m.txid)+'"><span class="k">'+esc(m.category||'message')+' · '+esc(timeAgo(msgTime(m)))+'</span><span class="c">'+esc(displayText(m))+'</span></a>';});
    h+='</div></div>';
    h+='<div class="about-sec"><div class="stats">';
    if(ch&&ch.blocks){h+='<div class="stat"><span class="v">'+fmt(ch.blocks)+'</span><span class="l">Blocks scanned</span></div><div class="stat"><span class="v">'+fmt(ch.opreturn_outputs)+'</span><span class="l">OP_RETURN outputs seen</span></div><div class="stat"><span class="v">'+(ch.opreturn_outputs?Math.round(ch.runes_outputs/ch.opreturn_outputs*100):0)+'%</span><span class="l">Runes (counted, not shown)</span></div><a class="stat" href="/protocols"><span class="v">'+state.protocols.length+'</span><span class="l">Protocols decoded →</span></a>';}
    else{h+='<div class="stat"><span class="v">'+state.collections.length+'</span><span class="l">Collections tracked</span></div><div class="stat"><span class="v">'+fmt(state.collections.reduce(function(t,c){return t+(c.address_count||0);},0))+'</span><span class="l">Addresses monitored</span></div><div class="stat"><span class="v">~3min</span><span class="l">Fresh every poll</span></div><div class="stat"><span class="v">∞</span><span class="l">Years it stays online</span></div>';}
    h+='</div>';
    h+='<div class="about-grid">';
    if(feat){h+='<a class="featured" href="/m/'+attr(feat.txid)+'"><span class="k">◆ TRANSMISSION OF THE DAY</span><blockquote>“'+esc(displayText(feat))+'”</blockquote><span class="m"><span>↳ '+esc(feat.collection_id?colName(feat.collection_id):shortAddr(feat.address))+'</span><span>'+esc(timeAgo(msgTime(feat)))+'</span><span style="color:var(--sig)">♥ '+fmt(feat.likes||0)+'</span></span></a>';}
    if(state.categories.length){var tot=state.categories.reduce(function(t,c){return t+(c.count||0);},0)||1;h+='<div class="chart"><span class="slabel">WHAT THEY’RE SAYING · BY CATEGORY</span>';state.categories.forEach(function(c){var p=Math.round(c.count/tot*100);h+='<a class="mix" href="/cat/'+encodeURIComponent(catSlug(c.category))+'"><div class="t"><span>'+esc(c.category)+'</span><span>'+p+'%</span></div><div class="bar"><i class="'+(HOSTILE[c.category]?'sig':'')+'" style="width:'+p+'%"></i></div></a>';});h+='</div>';}
    h+='</div></div>';
    h+='<div class="about-sec"><span class="kicker">◆ FAQ</span><div class="faq">';
    FAQ.forEach(function(f,i){var open=!!state.faqOpen[i];h+='<button class="faq-item'+(open?' open':'')+'" data-action="faq-toggle" data-i="'+i+'"><span class="faq-q"><span>'+esc(f[0])+'</span><span class="sign">'+(open?'−':'+')+'</span></span><span class="faq-a">'+esc(f[1])+'</span></button>';});
    h+='</div></div></main>';
    app.innerHTML=h;
  }
  var _learnHtml={};
  function renderLearn(){
    var key=location.pathname;
    var cur=app.querySelector('[data-learn]');
    var want=key==='/learn'?'index':key.slice('/learn/'.length);
    if(cur&&cur.getAttribute('data-learn')===want)return;
    if(_learnHtml[key]){app.innerHTML=_learnHtml[key];applyLearnMeta();return;}
    app.innerHTML='<main class="page"><div class="empty">Loading\\u2026</div></main>';
    fetch(key+'?partial=1',{headers:{accept:'text/html'}}).then(function(r){return r.ok?r.text():Promise.reject(r.status);}).then(function(html){_learnHtml[key]=html;if(location.pathname===key){app.innerHTML=html;applyLearnMeta();window.scrollTo(0,0);}}).catch(function(){state.screen='notfound';renderNotFound();});
  }
  function applyLearnMeta(){var el=app.querySelector('[data-learn]');if(!el)return;var t=el.getAttribute('data-title');if(t)document.title=t;var c=document.querySelector('link[rel="canonical"]');if(c)c.setAttribute('href',location.origin+location.pathname);var d=el.getAttribute('data-description');var md=document.querySelector('meta[name="description"]');if(md&&d)md.setAttribute('content',d);}
  function renderNotFound(){
    app.innerHTML='<main class="page" style="align-items:center;text-align:center;padding-top:80px"><span class="kicker">◆ 404 NOT FOUND</span><h1 class="title" style="font-size:48px">Record not found</h1><p class="lede">The requested blockchain transmission or collection does not exist in this archive.</p><div class="cta"><a class="btn btn-primary" href="/feed">Return to the feed →</a><a class="btn" href="/collections">Browse collections</a></div></main>';
  }

  function render(){
    if(state.screen==='about')renderAbout();
    else if(state.screen==='collections')renderCollections();
    else if(state.screen==='protocols')renderProtocols();
    else if(state.screen==='feed')renderFeed();
    else if(state.screen==='etch')renderEtch();
    else if(state.screen==='detail')renderDetail();
    else if(state.screen==='chat')renderChat();
    else if(state.screen==='learn')renderLearn();
    else renderNotFound();
    syncShell();
  }

  /* ---- routing ---- */
  function currentRoute(){
    var parts=location.pathname.split('/').filter(Boolean);
    var chat=parts.length>2&&parts[parts.length-1]==='chat';
    if(chat)parts=parts.slice(0,-1);
    return {name:parts[0]||'about',param:decodeURIComponent(parts.slice(1).join('/'))||null,chat:chat};
  }
  function defaultSort(r){return r.name==='c'||r.name==='cat'||r.name==='a'?'hot':'new';}
  function resetFilters(){state.filter=null;state.address=null;state.category=null;state.protocol=null;state.tick=null;state.block=null;state.newBlock=null;}
  function feedScreen(){state.screen='feed';state.nextBefore=null;return loadFeed(false).then(render);}
  function route(){
    var r=currentRoute();var qs=new URLSearchParams(location.search);
    var sp=qs.get('sort');state.sort=sp==='new'||sp==='hot'?sp:defaultSort(r);
    resetFilters();
    state.kind=qs.get('kind')==='all'?'all':'text';
    state.q=qs.get('q')||'';
    closeSheet();
    if(r.name==='collections'){state.screen='collections';return render();}
    if(r.name==='protocols'){state.screen='protocols';return Promise.all([loadProtocols(),loadTicks(),loadChain()]).then(render);}
    if(r.name==='guide'){state.screen='etch';return render();}
    if(r.name==='learn'){state.screen='learn';return render();}
    if(r.name==='feed')return feedScreen();
    if(r.name==='rooms'){var best=null;state.collections.forEach(function(c){if(!best||(c.message_count||0)>(best.message_count||0))best=c;});if(best){state.filter=best.id;state.screen='chat';resetChat();return loadChat(false).then(render);}state.screen='chat';return render();}
    if(r.name==='c'){var col=colById(Number(r.param))||colBySlug(r.param);if(col){state.filter=col.id;if(r.chat){state.screen='chat';resetChat();return loadChat(false).then(render);}return feedScreen();}state.screen='notfound';return render();}
    if(r.name==='cat'){var cn=catName(r.param);if(cn){state.category=cn;return feedScreen();}state.screen='notfound';return render();}
    if(r.name==='p'&&r.param){state.protocol=String(r.param).toLowerCase();state.kind='all';state.screen='feed';state.nextBefore=null;return Promise.all([loadFeed(false),state.protocols.length?Promise.resolve():loadProtocols(),loadTicks('&protocol='+encodeURIComponent(state.protocol))]).then(render);}
    if(r.name==='tick'&&r.param){state.tick=r.param;state.kind='all';state.screen='feed';state.nextBefore=null;return Promise.all([loadFeed(false),loadTicks()]).then(render);}
    if(r.name==='block'&&r.param&&/^\\d+$/.test(r.param)){state.block=Number(r.param);state.kind='all';state.screen='feed';state.nextBefore=null;return Promise.all([loadFeed(false),loadBlock(state.block)]).then(render);}
    if(r.name==='a'&&r.param){state.address=r.param;state.kind='all';if(r.chat){state.screen='chat';resetChat();return loadChat(false).then(render);}return feedScreen();}
    if(r.name==='m'&&r.param){state.screen='detail';state.detailTx=r.param;state.related=[];return ensureDetail().then(function(){var m=state.cache[r.param];if(!m){state.screen='notfound';render();return;}return loadRelated(m).then(render);});}
    if(r.name!=='about'){state.screen='notfound';return render();}
    state.screen='about';
    return (Object.keys(state.cache).length?Promise.resolve():fetchJSON('/api/messages?sort=new&limit=12').then(function(x){cacheMsgs((x.d&&x.d.messages)||[]);}).catch(function(){})).then(render);
  }
  function navigate(path){if(location.pathname+location.search===path)route();else{history.pushState({},'',path);_inApp++;route();window.scrollTo(0,0);}}
  function goBack(){if(_inApp>0){_inApp--;history.back();}else navigate('/feed');}

  /* ---- sheet & theme ---- */
  var _sheetOpener=null;
  function openSheet(){var s=document.getElementById('sheet');if(!s)return;_sheetOpener=document.activeElement;s.hidden=false;document.body.classList.add('locked');state.sheet=true;syncShell();var f=s.querySelector('a,button');if(f)f.focus();}
  function closeSheet(){var s=document.getElementById('sheet');if(!s||s.hidden){state.sheet=false;document.body.classList.remove('locked');return;}s.hidden=true;document.body.classList.remove('locked');state.sheet=false;if(_sheetOpener&&_sheetOpener.focus){try{_sheetOpener.focus();}catch(e){}}_sheetOpener=null;}
  document.addEventListener('keydown',function(e){if(e.key!=='Tab'||!state.sheet)return;var s=document.getElementById('sheet');var f=s.querySelectorAll('a[href],button:not([disabled])');if(!f.length)return;var first=f[0],last=f[f.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}});
  function applyTheme(t){var root=document.documentElement;if(t)root.setAttribute('data-theme',t);else root.removeAttribute('data-theme');var dark=t?t==='dark':(window.matchMedia&&window.matchMedia('(prefers-color-scheme:dark)').matches);var b=document.querySelectorAll('[data-action="theme"]');for(var i=0;i<b.length;i++)b[i].textContent=dark?'☀ Light':'☾ Dark';}
  function toggleTheme(){var cur=document.documentElement.getAttribute('data-theme');var dark=cur?cur==='dark':(window.matchMedia&&window.matchMedia('(prefers-color-scheme:dark)').matches);var next=dark?'light':'dark';try{localStorage.setItem('opreturn_theme',next);}catch(e){}applyTheme(next);}

  /* ---- events ---- */
  document.addEventListener('click',function(e){
    var t=e.target.closest?e.target.closest('[data-action]'):null;
    var a=t?t.getAttribute('data-action'):null;
    if(!a){
      var link=e.target.closest?e.target.closest('a[href^="/"]'):null;
      if(link&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&link.getAttribute('target')!=='_blank'){var href=link.getAttribute('href');if(href&&href.indexOf('/api/')!==0&&!/\\.(png|xml|txt|json)$/.test(href)){e.preventDefault();navigate(href);}}
      return;
    }
    if(a==='nav'){navigate(t.getAttribute('data-href'));return;}
    if(a==='back')return goBack();
    if(a==='more'){loadFeed(true).then(render);return;}
    if(a==='reveal-new'){revealNew();return;}
    if(a==='chat-earlier'){state.chatScroll={keep:document.documentElement.scrollHeight-window.scrollY};loadChat(true).then(render);return;}
    if(a==='keb-toggle'){var kb=document.getElementById('keb');if(kb)kb.classList.toggle('open');return;}
    if(a==='share-room'){copyLink(t,'SHARE ROOM ↗');return;}
    if(a==='open-msg')return navigate('/m/'+t.getAttribute('data-txid'));
    if(a==='vote'){vote(Number(t.getAttribute('data-id')),t.getAttribute('data-dir')==='down'?'down':'up');return;}
    if(a==='copy'){copy(t.getAttribute('data-copy'),t);return;}
    if(a==='share'){copyLink(t,'Share card');return;}
    if(a==='copy-hex'){try{navigator.clipboard.writeText(etchHex().hex);}catch(x){}t.textContent='Copied ✓';setTimeout(function(){t.textContent='Copy hex';},1400);return;}
    if(a==='step-toggle'){var i=Number(t.getAttribute('data-i'));state.stepOpen[i]=!state.stepOpen[i];renderEtch();return;}
    if(a==='faq-toggle'){var j=Number(t.getAttribute('data-i'));state.faqOpen[j]=!state.faqOpen[j];renderAbout();return;}
    if(a==='theme'){toggleTheme();return;}
    if(a==='sheet-open'){openSheet();return;}
    if(a==='sheet-close'){closeSheet();return;}
    if(a==='open-decrypt'){openDecrypt(t.getAttribute('data-txid'),t.getAttribute('data-payload'),t.getAttribute('data-addr'));return;}
    if(a==='decrypt-close'){closeDecrypt();return;}
    if(a==='decrypt-submit'){submitDecrypt();return;}
    if(a==='toggle-armor'){var tgt=document.getElementById(t.getAttribute('data-target'));if(tgt)tgt.style.display=tgt.style.display==='none'?'block':'none';return;}
    if(a==='suggest-open'){openSuggest(t.getAttribute('data-col'));return;}
    if(a==='suggest-close'){closeSuggest();return;}
    if(a==='suggest-submit'){submitSuggest();return;}
    if(a==='sug-col'){var col=t.getAttribute('data-id');document.getElementById('sug-col').value=col;var cs=document.querySelectorAll('[data-action="sug-col"]');for(var k=0;k<cs.length;k++)cs[k].classList.toggle('active',cs[k]===t);return;}
  });
  document.addEventListener('input',function(e){
    if(e.target.id==='etch-text'){state.etch=e.target.value;updateEtch();}
    if(e.target.id==='sug-addr'){validateSug();}
  });
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape'){closeSuggest();closeDecrypt();closeSheet();return;}
    if(e.key==='/'&&!/input|textarea|select/i.test(e.target.tagName)&&!e.target.isContentEditable&&window.innerWidth>=760){var q=document.getElementById('side-q');if(q){e.preventDefault();q.focus();}}
    if(e.key==='Enter'&&e.target.id==='side-q'){var v=e.target.value.trim();navigate('/feed'+(v?'?q='+encodeURIComponent(v):'')+(state.kind==='all'?(v?'&':'?')+'kind=all':''));}
  });
  var sheetEl=document.getElementById('sheet');
  if(sheetEl)sheetEl.addEventListener('click',function(e){if(e.target===this)closeSheet();});
  var _sm=document.getElementById('suggest-modal');
  if(_sm)_sm.addEventListener('click',function(e){if(e.target===this)closeSuggest();});
  var _dm=document.getElementById('decrypt-modal');
  if(_dm)_dm.addEventListener('click',function(e){if(e.target===this)closeDecrypt();});
  var _pwdToggle=document.getElementById('dec-toggle-pwd');
  if(_pwdToggle)_pwdToggle.addEventListener('click',function(){var inp=document.getElementById('dec-privkey');if(inp)inp.type=inp.type==='password'?'text':'password';});
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')pollNewBlocks();});

  function copy(txt,btn){try{navigator.clipboard.writeText(txt);var old=btn.textContent;btn.textContent='copied ✓';setTimeout(function(){btn.textContent=old;},1100);}catch(e){}}
  function copyLink(btn,label){try{navigator.clipboard.writeText(location.href);btn.textContent='Link copied ✓';setTimeout(function(){btn.textContent=label;},1600);}catch(e){}}

  /* ---- voting: proof-of-work + one vote per visitor ---- */
  /* synchronous SHA-256 (hex) so 16-bit PoW mines in ~milliseconds instead of thousands of async WebCrypto calls */
  function sha256(a){function e(a,b){return a>>>b|a<<32-b}var b,c,d,h=Math.pow,j=h(2,32),k="",l=[],m=8*a.length,n=sha256.h=sha256.h||[],o=sha256.k=sha256.k||[],p=o.length;for(var q={},r=2;p<64;r++)if(!q[r]){for(b=0;b<313;b+=r)q[b]=r;n[p]=h(r,.5)*j|0,o[p++]=h(r,1/3)*j|0}for(a+="\\u0080";a.length%64-56;)a+="\\u0000";for(b=0;b<a.length;b++){if(c=a.charCodeAt(b),c>>8)return;l[b>>2]|=c<<(3-b)%4*8}for(l[l.length]=m/j|0,l[l.length]=m,d=0;d<l.length;){var s=l.slice(d,d+=16),t=n;for(n=n.slice(0,8),b=0;b<64;b++){var u=s[b-15],v=s[b-2],w=n[0],x=n[4],y=n[7]+(e(x,6)^e(x,11)^e(x,25))+(x&n[5]^~x&n[6])+o[b]+(s[b]=b<16?s[b]:s[b-16]+(e(u,7)^e(u,18)^u>>>3)+s[b-7]+(e(v,17)^e(v,19)^v>>>10)|0),z=(e(w,2)^e(w,13)^e(w,22))+(w&n[1]^w&n[2]^n[1]&n[2]);n=[y+z|0].concat(n),n[4]=n[4]+y|0}for(b=0;b<8;b++)n[b]=n[b]+t[b]|0}for(b=0;b<8;b++)for(c=3;c+1;c--){var A=n[b]>>8*c&255;k+=(A<16?0:"")+A.toString(16)}return k}
  function powPrefix(){var z='';for(var i=0;i<POW_BITS/4;i++)z+='0';return z;}
  /* chunked, non-blocking miner: hashes in small batches yielding to the event loop, so the UI stays live and the pickaxe animates while it works */
  function mineAsync(id,onProgress){
    return new Promise(function(resolve){
      var nonce=0,pre=powPrefix();
      function chunk(){
        var end=nonce+1200;
        for(;nonce<end;nonce++){var hh=sha256(id+':'+nonce);if(hh.slice(0,pre.length)===pre){resolve({nonce:nonce,hash:hh});return;}}
        onProgress&&onProgress(nonce);
        setTimeout(chunk,0);
      }
      chunk();
    });
  }
  function setMineStatus(n){var st=document.getElementById('status');if(st)st.textContent='\\u26cf mining proof-of-work\\u2026 '+n.toLocaleString()+' hashes tried ('+POW_BITS+'-bit target)';}
  function markMining(id,dir){
    var btns=document.querySelectorAll('[data-id="'+id+'"][data-action="vote"], [data-id="'+id+'"][data-action="like"]');
    for(var i=0;i<btns.length;i++){
      var b=btns[i];
      if(!dir||b.getAttribute('data-dir')===dir||b.getAttribute('data-action')==='like'){
        b.classList.add('mining');
        b.innerHTML='\\u26cf';
      }
    }
    setMineStatus(0);
  }
  function vote(id,dir){
    dir=dir==='down'?'down':'up';
    if(state.voted[id]||state.mining[id])return;
    state.mining[id]=true;markMining(id,dir);
    mineAsync(String(id),setMineStatus).then(function(pow){
      return fetchJSON('/api/vote',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message_id:id,nonce:pow.nonce,pow:pow.hash,direction:dir})});
    }).then(function(res){
      state.mining[id]=false;
      if((res.d&&res.d.ok)||res.status===409){
        state.voted[id]=dir;
        if(dir==='up')state.liked[id]=true;
        try{
          localStorage.setItem('opreturn_voted',JSON.stringify(state.voted));
          localStorage.setItem('opreturn_liked',JSON.stringify(state.liked));
        }catch(e){}
        if(res.d&&typeof res.d.likes==='number'){
          if(state.cache[id])state.cache[id].likes=res.d.likes;
          state.feed.forEach(function(m){if(m.id===id)m.likes=res.d.likes;});
          if(state.chat&&state.chat.messages){
            state.chat.messages.forEach(function(m){if(m.id===id)m.likes=res.d.likes;});
          }
        }
      }
      render();
    }).catch(function(){state.mining[id]=false;render();});
  }
  function like(id){vote(id,'up');}

  /* ---- suggest an address (public queue -> admin review) ---- */
  var ADDR_RE=/^(bc1[02-9ac-hj-np-z]{11,87}|[13][1-9A-HJ-NP-Za-km-z]{25,39})$/;
  function setSugMsg(t,cls){var el=document.getElementById('sug-msg');if(el){el.textContent=t;el.className='modal-msg'+(cls?' '+cls:'');}}
  function validateSug(){var inp=document.getElementById('sug-addr');if(!inp)return false;var v=inp.value.trim();var ok=ADDR_RE.test(v);inp.className=v?(ok?'ok':'bad'):'';setSugMsg(v?(ok?'✓ Valid address format':'Not a valid Bitcoin address'):'',v?(ok?'ok':'err'):'');return ok;}
  function openSuggest(colId){
    var wrap=document.getElementById('sug-cols');
    wrap.innerHTML=state.collections.map(function(c){return '<button type="button" class="chip'+(String(c.id)===String(colId)?' active':'')+'" data-action="sug-col" data-id="'+c.id+'">'+esc(shortCol(c))+'</button>';}).join('');
    document.getElementById('sug-col').value=colId||(state.collections[0]?state.collections[0].id:'');
    if(!colId&&wrap.firstChild)wrap.firstChild.classList.add('active');
    var a=document.getElementById('sug-addr');a.value='';a.className='';document.getElementById('sug-note').value='';setSugMsg('','');
    var b=document.getElementById('sug-submit');b.disabled=false;b.textContent='Submit suggestion';
    document.getElementById('suggest-modal').hidden=false;
    setTimeout(function(){a.focus();},30);
  }
  function closeSuggest(){var m=document.getElementById('suggest-modal');if(m)m.hidden=true;}
  function submitSuggest(){
    var addr=document.getElementById('sug-addr').value.trim();
    var colId=Number(document.getElementById('sug-col').value)||null;
    var note=document.getElementById('sug-note').value.trim();
    if(!validateSug()){setSugMsg('That doesn’t look like a Bitcoin address.','err');return;}
    var b=document.getElementById('sug-submit');b.disabled=true;
    setSugMsg('⛏ mining proof-of-work…','');
    mineAsync(addr,function(n){setSugMsg('⛏ mining proof-of-work… '+n.toLocaleString()+' hashes','');}).then(function(pow){
      return fetchJSON('/api/suggest',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({address:addr,collection_id:colId,note:note,nonce:pow.nonce,pow:pow.hash})});
    }).then(function(res){
      b.disabled=false;
      if(res.status===200&&res.d&&res.d.ok){setSugMsg('✓ Submitted. A human will review it.','ok');b.textContent='Submitted ✓';setTimeout(closeSuggest,1200);}
      else if(res.status===409){setSugMsg('This address is already '+((res.d&&res.d.error==='already monitored')?'monitored.':'in the review queue.'),'err');}
      else{setSugMsg((res.d&&res.d.error)||'Something went wrong — try again.','err');}
    }).catch(function(){b.disabled=false;setSugMsg('Network error — try again.','err');});
  }

  /* Cryptographic envelope parser for OpenPGP & Electrum BIE1 ECIES messages */
  function parseCryptoEnvelope(content){
    if(!content)return null;
    var text=String(content).trim();
    var hasPgpSigned=text.indexOf('-----BEGIN PGP SIGNED MESSAGE-----')!==-1;
    var hasPgpMsg=text.indexOf('-----BEGIN PGP MESSAGE-----')!==-1;
    var hasBie1=text.indexOf('QklFMQ')!==-1;
    if(!hasPgpSigned&&!hasPgpMsg&&!hasBie1)return null;

    var res={
      type:'plain',
      leadText:'',
      bie1Payload:null,
      pgpArmor:null,
      isSigned:false,
      signer:null,
      signerKey:null,
      signerFp:null,
      recipient:null,
      recipientKey:null,
      raw:text
    };

    if(text.indexOf('-----BEGIN PGP SIGNATURE-----')!==-1){
      res.isSigned=true;
      res.signer='Blockstream Security';
      res.signerKey='4AC8CC886844A2D6';
      res.signerFp='1176 542D A98E 71E1 3372 2EF7 4AC8 CC88 6844 A2D6';
    }

    if(hasPgpSigned){
      var sigIdx=text.indexOf('-----BEGIN PGP SIGNATURE-----');
      var headIdx=text.indexOf('-----BEGIN PGP SIGNED MESSAGE-----');
      var body=text.slice(headIdx,sigIdx!==-1?sigIdx:text.length);
      var sMarker='-----BEGIN PGP SIGNED MESSAGE-----';
      var mPos=body.indexOf(sMarker);
      if(mPos!==-1){
        body=body.slice(mPos+sMarker.length).trim();
        if(body.indexOf('Hash:')===0){
          var nl=body.indexOf(String.fromCharCode(10));
          if(nl!==-1)body=body.slice(nl+1).trim();
        }
      }
      var bMatch=body.match(/QklFMQ[A-Za-z0-9+/=]+/);
      if(bMatch){
        res.type='bie1';
        res.bie1Payload=bMatch[0];
        res.leadText=body.slice(0,bMatch.index).trim();
        res.recipient='Whitehat (bc1ql4mfu...jlte)';
      } else {
        res.type='pgp-signed';
        res.leadText=body;
      }
      res.pgpArmor=sigIdx!==-1?text.slice(sigIdx):null;
      return res;
    }

    if(hasPgpMsg){
      var msgIdx=text.indexOf('-----BEGIN PGP MESSAGE-----');
      var lead=text.slice(0,msgIdx).trim();
      var endIdx=text.indexOf('-----END PGP MESSAGE-----');
      var armor=text.slice(msgIdx,endIdx!==-1?endIdx+25:text.length);
      res.type='pgp-encrypted';
      res.leadText=lead;
      res.pgpArmor=armor;
      res.recipient='Blockstream Security';
      res.recipientKey='BB332D31CBA44EDF';
      return res;
    }

    if(hasBie1){
      var bMatch2=text.match(/QklFMQ[A-Za-z0-9+/=]+/);
      if(bMatch2){
        res.type='bie1';
        res.bie1Payload=bMatch2[0];
        res.leadText=text.slice(0,bMatch2.index).trim();
        res.recipient='Whitehat (bc1ql4mfu...jlte)';
        if(res.isSigned){
          var sIdx=text.indexOf('-----BEGIN PGP SIGNATURE-----');
          if(sIdx!==-1)res.pgpArmor=text.slice(sIdx);
        }
        return res;
      }
    }
    return null;
  }

  /* ---- client-side Electrum BIE1 ECIES decryption ---- */
  var B58_CHARS='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  function b58decode(str){
    var bytes=[0];
    for(var i=0;i<str.length;i++){
      var c=str[i];var val=B58_CHARS.indexOf(c);
      if(val===-1)throw new Error('Invalid base58 character: '+c);
      for(var j=0;j<bytes.length;j++)bytes[j]*=58;
      bytes[0]+=val;
      var carry=0;
      for(var j=0;j<bytes.length;j++){bytes[j]+=carry;carry=bytes[j]>>8;bytes[j]&=255;}
      while(carry>0){bytes.push(carry&255);carry>>=8;}
    }
    for(var i=0;i<str.length&&str[i]==='1';i++)bytes.push(0);
    return bytes.reverse();
  }
  function wifToHex(wif){
    wif=wif.trim();
    if(/^[0-9a-fA-F]{64}$/.test(wif))return wif.toLowerCase();
    var raw=b58decode(wif);
    if(raw.length===37||raw.length===38){
      var hex='';
      for(var i=1;i<33;i++)hex+=(raw[i]<16?'0':'')+raw[i].toString(16);
      return hex;
    }
    throw new Error('Invalid key format. Enter a 64-hex string or WIF key.');
  }

  var SECP_P=BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F');
  function secpMod(a,m){var r=a%(m||SECP_P);return r>=0n?r:r+(m||SECP_P);}
  function secpInv(a,m){
    a=secpMod(a,m||SECP_P);
    var exp=(m||SECP_P)-2n,res=1n,base=a;
    while(exp>0n){if(exp&1n)res=(res*base)%(m||SECP_P);base=(base*base)%(m||SECP_P);exp>>=1n;}
    return res;
  }
  function secpAdd(p1,p2){
    if(!p1)return p2;if(!p2)return p1;
    var x1=p1[0],y1=p1[1],x2=p2[0],y2=p2[1];
    if(x1===x2){
      if(y1!==y2)return null;
      var lam=(3n*x1*x1%SECP_P*secpInv(2n*y1))%SECP_P;
      var x3=secpMod(lam*lam-2n*x1);
      var y3=secpMod(lam*(x1-x3)-y1);
      return [x3,y3];
    }
    var lam=(secpMod(y2-y1)*secpInv(secpMod(x2-x1)))%SECP_P;
    var x3=secpMod(lam*lam-x1-x2);
    var y3=secpMod(lam*(x1-x3)-y1);
    return [x3,y3];
  }
  function secpMul(k,p){
    var r=null,base=p;
    while(k>0n){if(k&1n)r=secpAdd(r,base);base=secpAdd(base,base);k>>=1n;}
    return r;
  }
  function secpDecompress(bytes){
    var prefix=bytes[0];
    var hex='';for(var i=1;i<bytes.length;i++)hex+=(bytes[i]<16?'0':'')+bytes[i].toString(16);
    var x=BigInt('0x'+hex);
    var ySq=secpMod(x*x*x+7n);
    var exp=(SECP_P+1n)/4n,res=1n,base=ySq;
    while(exp>0n){if(exp&1n)res=(res*base)%SECP_P;base=(base*base)%SECP_P;exp>>=1n;}
    var y=res;
    if((y%2n===0n?2:3)!==prefix)y=secpMod(-y);
    return [x,y];
  }

  async function decryptBIE1WebCrypto(b64,privKeyHex){
    var subtle=window.crypto&&window.crypto.subtle;
    if(!subtle)throw new Error('WebCrypto API not supported in this environment');
    var raw=atob(b64.trim().replace(/\\s+/g,''));
    var buf=new Uint8Array(raw.length);
    for(var i=0;i<raw.length;i++)buf[i]=raw.charCodeAt(i);
    if(buf.length<85)throw new Error('Ciphertext payload is too short (< 85 bytes)');
    var magic=String.fromCharCode(buf[0],buf[1],buf[2],buf[3]);
    if(magic!=='BIE1')throw new Error('Invalid magic bytes: expected BIE1');
    var ephemPubBytes=buf.slice(4,37);
    var ciphertext=buf.slice(37,buf.length-32);
    var mac=buf.slice(buf.length-32);
    var ephemPoint=secpDecompress(ephemPubBytes);
    var privInt=BigInt('0x'+privKeyHex);
    var sharedPoint=secpMul(privInt,ephemPoint);
    if(!sharedPoint)throw new Error('Invalid point multiplication (point at infinity)');
    var sharedHex=(sharedPoint[1]%2n===0n?'02':'03')+sharedPoint[0].toString(16).padStart(64,'0');
    var sharedBytes=new Uint8Array(33);
    for(var i=0;i<33;i++)sharedBytes[i]=parseInt(sharedHex.slice(i*2,i*2+2),16);

    var hashBuf=await subtle.digest('SHA-512',sharedBytes);
    var key=new Uint8Array(hashBuf);
    var iv=key.slice(0,16);
    var key_e=key.slice(16,32);
    var key_m=key.slice(32,64);

    var hmacKey=await subtle.importKey('raw',key_m,{name:'HMAC',hash:'SHA-256'},false,['verify']);
    var isValid=await subtle.verify('HMAC',hmacKey,mac,buf.slice(0,buf.length-32));
    if(!isValid)throw new Error('HMAC verification failed (incorrect private key for this message)');

    var aesKey=await subtle.importKey('raw',key_e,{name:'AES-CBC'},false,['decrypt']);
    var decryptedBuf=await subtle.decrypt({name:'AES-CBC',iv:iv},aesKey,ciphertext);
    return new TextDecoder().decode(decryptedBuf);
  }

  function openDecrypt(txid,payload,addr){
    var m=document.getElementById('decrypt-modal');
    if(!m)return;
    document.getElementById('dec-target-txid').value=txid||'';
    document.getElementById('dec-payload').value=payload||'';
    document.getElementById('dec-target-addr').textContent=addr||'';
    document.getElementById('dec-privkey').value='';
    var msgEl=document.getElementById('dec-msg');
    msgEl.textContent='';msgEl.className='modal-msg';
    document.getElementById('dec-result').style.display='none';
    document.getElementById('dec-plaintext').textContent='';
    var b=document.getElementById('dec-submit');b.disabled=false;b.textContent='Decrypt message';
    m.hidden=false;
    setTimeout(function(){var a=document.getElementById('dec-privkey');if(a)a.focus();},40);
  }
  function closeDecrypt(){var m=document.getElementById('decrypt-modal');if(m)m.hidden=true;}
  function submitDecrypt(){
    var privKey=document.getElementById('dec-privkey').value.trim();
    var payload=document.getElementById('dec-payload').value.trim();
    var txid=document.getElementById('dec-target-txid').value.trim();
    var msgEl=document.getElementById('dec-msg');
    var resEl=document.getElementById('dec-result');
    var ptEl=document.getElementById('dec-plaintext');
    var b=document.getElementById('dec-submit');
    if(!privKey){msgEl.textContent='Please enter a private key.';msgEl.className='modal-msg err';return;}
    b.disabled=true;
    msgEl.textContent='\u26cf Computing secp256k1 point multiplication & WebCrypto AES...';
    msgEl.className='modal-msg';
    setTimeout(function(){
      try{
        var hexKey=wifToHex(privKey);
        decryptBIE1WebCrypto(payload,hexKey).then(function(decrypted){
          b.disabled=false;
          msgEl.textContent='\u2713 Decrypted successfully!';
          msgEl.className='modal-msg ok';
          ptEl.textContent=decrypted;
          resEl.style.display='block';
          if(txid){
            var cardDec=document.getElementById('dec-'+txid);
            if(cardDec){
              cardDec.innerHTML='<strong>\ud83d\udd13 Decrypted Plaintext:</strong><div style="margin-top:5px">'+esc(decrypted)+'</div>';
              cardDec.style.display='block';
            }
          }
        }).catch(function(err){
          b.disabled=false;
          msgEl.textContent='Decryption error: '+(err.message||'Invalid key or corrupted ciphertext');
          msgEl.className='modal-msg err';
          resEl.style.display='none';
        });
      }catch(err){
        b.disabled=false;
        msgEl.textContent='Decryption error: '+(err.message||'Invalid private key format');
        msgEl.className='modal-msg err';
        resEl.style.display='none';
      }
    },20);
  }


  /* ---- WebMCP: Expose site tools to AI agents via browser API ---- */
  function initWebMcp(){
    if(typeof navigator==='undefined'||!('modelContext' in navigator)||!navigator.modelContext||typeof navigator.modelContext.registerTool!=='function')return;
    try{
      navigator.modelContext.registerTool({
        name: "search-transmissions",
        description: "Search and retrieve live monitored Bitcoin OP_RETURN messages. Returns messages with txid, content, sender, address, and category.",
        inputSchema: {
          type: "object",
          properties: {
            sort: { type: "string", enum: ["hot", "new"], description: "Sort by hottest or newest" },
            collection_id: { type: "number", description: "Filter by collection ID" },
            category: { type: "string", description: "Filter by category slug" },
            protocol: { type: "string", description: "Filter by OP_RETURN protocol slug (ico-20, crc-20, thorchain, omni, ...)" },
            tick: { type: "string", description: "Filter by token ticker, e.g. LEAF" },
            kind: { type: "string", enum: ["text", "all"], description: "text = human messages only (default); all = every decoded protocol" },
            limit: { type: "number", description: "Max results to return (1-50)" }
          }
        },
        execute: async function(params){
          var q = '/api/messages?sort=' + (params.sort || 'hot') + '&limit=' + (params.limit || 20);
          if (params.collection_id) q += '&collection_id=' + params.collection_id;
          if (params.category) q += '&category=' + encodeURIComponent(params.category);
          if (params.protocol) q += '&protocol=' + encodeURIComponent(params.protocol);
          if (params.tick) q += '&tick=' + encodeURIComponent(params.tick);
          if (params.kind === 'all') q += '&kind=all';
          var r = await fetch(q);
          var data = await r.json();
          return { content: [{ type: "text", text: JSON.stringify(data.messages || data) }] };
        }
      });

      navigator.modelContext.registerTool({
        name: "list-collections",
        description: "List all curated collections of monitored Bitcoin addresses (e.g. Bitget hack, Liquid Network whitehat, Coldcard exploit, Genesis memorials).",
        inputSchema: { type: "object", properties: {} },
        execute: async function(){
          var r = await fetch('/api/collections');
          var data = await r.json();
          return { content: [{ type: "text", text: JSON.stringify(data) }] };
        }
      });

      navigator.modelContext.registerTool({
        name: "get-message-detail",
        description: "Fetch a specific immutable Bitcoin OP_RETURN message by its 64-character transaction ID (txid).",
        inputSchema: {
          type: "object",
          properties: {
            txid: { type: "string", description: "Bitcoin transaction ID (hex)" }
          },
          required: ["txid"]
        },
        execute: async function(params){
          var r = await fetch('/api/message/' + encodeURIComponent(params.txid));
          var data = await r.json();
          return { content: [{ type: "text", text: JSON.stringify(data) }] };
        }
      });

      navigator.modelContext.registerTool({
        name: "navigate-page",
        description: "Navigate to a specific page on The Permanent Record ('feed', 'collections', 'guide', 'landing').",
        inputSchema: {
          type: "object",
          properties: {
            page: { type: "string", enum: ["feed", "rooms", "protocols", "collections", "guide", "about", "landing"], description: "Destination screen" }
          },
          required: ["page"]
        },
        execute: async function(params){
          go(params.page);
          return { content: [{ type: "text", text: "Navigated to " + params.page }] };
        }
      });
    }catch(e){}
  }

  function go(screen){navigate({landing:'/',about:'/',feed:'/feed',rooms:'/rooms',collections:'/collections',guide:'/guide',protocols:'/protocols'}[screen]||'/');}

  /* ---- boot ---- */
  try{applyTheme(localStorage.getItem('opreturn_theme')||'');}catch(e){applyTheme('');}
  initWebMcp();
  Promise.all([loadCollections(),loadCategories(),loadProtocols(),loadChain()]).then(function(){
    route();
    window.addEventListener('popstate',route);
    _pollTimer=setInterval(pollNewBlocks,60000);
  });
})();

</script>
</body>
</html>`;
}
