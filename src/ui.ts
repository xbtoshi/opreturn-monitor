/**
 * Single-page web UI served by the Worker at GET /.
 * "The Permanent Record" (opreturn.xyz) — vanilla JS, no build step; ships inside the one Worker bundle.
 * Screens: landing, collections, feed, message artifact, and an "etch" field manual.
 * Talks to /api/collections, /api/messages and /api/like. Likes require a 16-bit
 * proof-of-work nonce (mined client-side, verified in index.ts).
 */

export interface PageMeta {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: string;
}

function esc(s: string): string {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderIndex(meta?: PageMeta): string {
  const m: PageMeta = meta || {};
  const ogTitle = m.title || 'OP_RETURN Monitor';
  const ogDesc =
    m.description ||
    'People are leaving messages inside Bitcoin. Forever. Threats, confessions, prayers, ads, haiku — archived live from the chain.';
  const ogUrl = m.url || 'https://opreturn.xyz/';
  const ogImage = m.image || 'https://opreturn.xyz/og/default.png';
  const ogType = m.type || 'website';
  const ogMeta = `<meta property="og:site_name" content="The Permanent Record" />
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
<meta name="twitter:image" content="${esc(ogImage)}" />
<link rel="canonical" href="${esc(ogUrl)}" />`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#e9e5d8" />
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#16150f" />
<title>${esc(ogTitle)}</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="icon" href="/favicon.png" sizes="32x32" type="image/png" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
${ogMeta}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Martian+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root{
    --bg:#e9e5d8; --dot:#d8d2c0; --card:#faf8f2;
    --fg:#16140d; --fg2:#3f3c30; --fg3:#5b5849; --fg4:#8a8676; --fg5:#b0aa98;
    --line:#16140d; --line2:#d9d3c4; --line3:#efeadd; --line4:#c9c2b0;
    --sig:#d9481f; --sigH:#b23815; --sigT:#f7e6df; --amber:#b5851f; --green:#5b7a4a;
    --inv-bg:#16140d; --inv-fg:#e9e5d8; --inv-fg2:#b8b2a2; --inv-fg3:#8a8676; --on-sig:#faf8f2;
  }
  @media (prefers-color-scheme:dark){
    :root{
      --bg:#16150f; --dot:#23211a; --card:#1e1c15;
      --fg:#ece7d8; --fg2:#c9c3b2; --fg3:#b0ab99; --fg4:#8f8b7a; --fg5:#6f6b5c;
      --line:#403c2d; --line2:#322f24; --line3:#2a2820; --line4:#3a372b;
      --sig:#e2592d; --sigH:#f06a3e; --sigT:#33231a; --amber:#d6a94a; --green:#8fbf72;
      --inv-bg:#16150f; --inv-fg:#ece7d8; --inv-fg2:#c9c3b2; --inv-fg3:#8f8b7a; --on-sig:#faf8f2;
    }
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html{color-scheme:light dark}
  body{background:var(--bg);color:var(--fg);font-family:'Space Grotesk',system-ui,sans-serif;-webkit-font-smoothing:antialiased;line-height:1.5;
    background-image:radial-gradient(var(--dot) 1px,transparent 1px);background-size:22px 22px}
  a{color:var(--sig);text-decoration:none}
  a:hover{color:var(--sigH)}
  button{font-family:inherit}
  ::selection{background:var(--sig);color:var(--on-sig)}
  @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.7)}}
  @keyframes marq{from{transform:translateX(0)}to{transform:translateX(-50%)}}
  @keyframes land{0%{opacity:0;transform:translateY(-8px)}100%{opacity:1;transform:translateY(0)}}
  @keyframes flick{0%,100%{opacity:1}50%{opacity:.35}}
  .mono{font-family:'Martian Mono',monospace}

  /* ticker */
  .ticker{background:var(--inv-bg);color:var(--inv-fg);overflow:hidden;white-space:nowrap;height:34px;display:flex;align-items:center}
  .tk-badge{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:0 16px;background:var(--sig);color:var(--on-sig);height:34px;font-family:'Martian Mono',monospace;font-size:11px;font-weight:600;letter-spacing:.08em;z-index:2}
  .tk-badge .dot{width:7px;height:7px;border-radius:50%;background:var(--on-sig);animation:pulse 1.4s infinite}
  .tk-wrap{position:relative;flex:1;overflow:hidden;height:34px}
  .tk-track{position:absolute;top:0;left:0;display:flex;align-items:center;height:34px;animation:marq 48s linear infinite;font-family:'Martian Mono',monospace;font-size:12px;color:var(--inv-fg2)}

  /* header */
  header{position:sticky;top:0;z-index:50;background:color-mix(in srgb,var(--bg) 85%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;padding:14px clamp(16px,4vw,44px)}
  .brand{display:flex;align-items:baseline;gap:10px;background:none;border:none;cursor:pointer;padding:0}
  .brand .logo{font-family:'Martian Mono',monospace;font-weight:600;font-size:clamp(15px,2vw,19px);letter-spacing:-.02em;color:var(--fg)}
  .brand .tag{font-size:10px;font-family:'Martian Mono',monospace;color:var(--fg4);letter-spacing:.12em;text-transform:uppercase}
  nav{display:flex;align-items:center;gap:4px}
  .navbtn{background:transparent;color:var(--fg);border:none;padding:9px 16px;font-size:14px;font-weight:500;cursor:pointer}
  .navbtn.active{background:var(--inv-bg);color:var(--inv-fg)}

  .wrap{max-width:1180px;margin:0 auto;padding:clamp(30px,5vw,60px) clamp(16px,4vw,44px) 80px}
  .wrap-narrow{max-width:940px}
  .wrap-card{max-width:820px}

  /* landing */
  .kicker{font-family:'Martian Mono',monospace;font-size:11px;letter-spacing:.14em;color:var(--fg4);margin-bottom:12px}
  .pill{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--line);padding:6px 12px;font-family:'Martian Mono',monospace;font-size:11px;letter-spacing:.06em;margin-bottom:28px}
  .pill .dot{width:6px;height:6px;border-radius:50%;background:var(--sig);animation:pulse 1.4s infinite}
  h1.hero{font-size:clamp(40px,8.5vw,104px);line-height:.92;font-weight:600;letter-spacing:-.035em;max-width:14ch;text-wrap:balance;color:var(--fg)}
  .lede{margin-top:26px;max-width:56ch;font-size:clamp(16px,2vw,21px);line-height:1.5;color:var(--fg2)}
  .cta{display:flex;flex-wrap:wrap;gap:14px;margin-top:38px}
  .btn{padding:15px 30px;font-size:16px;font-weight:600;cursor:pointer;border:1px solid var(--fg);background:none;color:var(--fg)}
  .btn:hover{background:var(--fg);color:var(--bg)}
  .btn-primary{background:var(--sig);color:var(--on-sig);border-color:var(--sig)}
  .btn-primary:hover{background:var(--sigH);border-color:var(--sigH);color:var(--on-sig)}

  .featured{border-top:1px solid var(--line);border-bottom:1px solid var(--line);background:var(--inv-bg);color:var(--inv-fg)}
  .featured .inner{max-width:1180px;margin:0 auto;padding:clamp(24px,4vw,44px) clamp(16px,4vw,44px)}
  .featured .k{font-family:'Martian Mono',monospace;font-size:11px;letter-spacing:.14em;color:var(--inv-fg3);margin-bottom:22px}
  .featured blockquote{font-size:clamp(24px,4.5vw,48px);line-height:1.18;font-weight:500;letter-spacing:-.02em;max-width:20ch}
  .featured .meta{display:flex;flex-wrap:wrap;gap:20px;align-items:center;margin-top:28px;font-family:'Martian Mono',monospace;font-size:12px;color:var(--inv-fg2)}
  .featured .meta .strong{color:var(--inv-fg)}
  .featured .meta .sig{color:var(--sig)}

  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1px;background:var(--line);border:1px solid var(--line)}
  .stat{background:var(--bg);padding:26px 22px}
  .stat .v{font-family:'Martian Mono',monospace;font-size:clamp(28px,4vw,42px);font-weight:600;letter-spacing:-.03em;color:var(--sig)}
  .stat .l{font-size:14px;color:var(--fg2);margin-top:6px}
  /* category chart */
  .chart{margin-top:18px;border:1px solid var(--line);background:var(--card);padding:24px 22px}
  .chart-row{display:grid;grid-template-columns:minmax(112px,210px) 1fr auto;align-items:center;gap:14px;padding:7px 0}
  .chart-label{font-family:'Martian Mono',monospace;font-size:11px;color:var(--fg3);letter-spacing:.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .chart-track{height:12px;background:var(--line3);border:1px solid var(--line2);overflow:hidden}
  .chart-fill{height:100%;background:var(--fg);transition:width .7s cubic-bezier(.2,.7,.2,1)}
  .chart-fill.sig{background:var(--sig)}
  .chart-num{font-family:'Martian Mono',monospace;font-size:13px;font-weight:600;color:var(--fg2);min-width:34px;text-align:right}
  @media (max-width:560px){.chart-row{grid-template-columns:1fr auto;gap:8px 12px}.chart-track{grid-column:1 / -1;order:3}}

  /* collections */
  h2.title{font-size:clamp(30px,5vw,54px);font-weight:600;letter-spacing:-.03em}
  .col-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:18px}
  .col-card{text-align:left;background:var(--card);border:1px solid var(--line);padding:26px 24px;cursor:pointer;display:flex;flex-direction:column;gap:16px;min-height:220px;color:var(--fg)}
  .col-card:hover{background:var(--inv-bg);color:var(--inv-fg)}
  .col-card .top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
  .col-card .code{font-family:'Martian Mono',monospace;font-size:11px;letter-spacing:.08em;color:var(--fg4)}
  .col-card .hot{font-family:'Martian Mono',monospace;font-size:10px;font-weight:600;color:var(--sig);letter-spacing:.06em}
  .col-card .name{font-size:22px;font-weight:600;letter-spacing:-.02em;line-height:1.15}
  .col-card .desc{font-size:14px;color:var(--fg3);line-height:1.45;flex:1}
  .col-card .foot{display:flex;gap:18px;font-family:'Martian Mono',monospace;font-size:12px;color:var(--fg4);border-top:1px solid var(--line2);padding-top:14px}
  .col-card .foot .read{margin-left:auto;color:var(--sig)}

  /* feed */
  .feed-head{display:flex;flex-wrap:wrap;gap:14px;justify-content:space-between;align-items:flex-end;margin-bottom:8px}
  .seg{display:inline-flex;border:1px solid var(--line)}
  .seg button{background:transparent;color:var(--fg);border:none;padding:11px 18px;font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap}
  .seg button.active{background:var(--sig);color:var(--on-sig)}
  .chips{display:flex;gap:8px;overflow-x:auto;padding:14px 0 20px;border-bottom:1px solid var(--line2);margin-bottom:24px}
  .chip{flex:0 0 auto;background:transparent;color:var(--fg3);border:1px solid var(--line4);padding:8px 14px;font-size:13px;white-space:nowrap;cursor:pointer}
  .chip.active{background:var(--inv-bg);color:var(--inv-fg);border-color:var(--inv-bg)}
  .feed-list{display:flex;flex-direction:column;gap:16px}

  /* suggest modal */
  .suggest-bar{margin:2px 0 20px}
  .btn-sm{padding:10px 18px;font-size:14px;border:1px solid var(--line);background:var(--card);color:var(--fg);cursor:pointer;font-weight:600}
  .btn-sm:hover{background:var(--inv-bg);color:var(--inv-fg)}
  .scrim{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:100;padding:20px}
  .scrim[hidden]{display:none}
  .modal{background:var(--card);border:1.5px solid var(--line);box-shadow:14px 14px 0 var(--line);width:min(520px,100%);max-height:90vh;overflow:auto}
  .modal-head{display:flex;justify-content:space-between;align-items:center;background:var(--inv-bg);color:var(--inv-fg);padding:14px 20px;font-family:'Martian Mono',monospace;font-size:12px;letter-spacing:.08em}
  .modal-x{background:none;border:none;color:var(--inv-fg);cursor:pointer;font-size:15px;line-height:1}
  .modal-body{padding:22px 22px 4px}
  .modal-lede{font-size:14px;color:var(--fg2);line-height:1.5;margin-bottom:20px}
  .fld{display:block;margin-bottom:16px}
  .fld>span{display:block;font-family:'Martian Mono',monospace;font-size:11px;letter-spacing:.08em;color:var(--fg4);text-transform:uppercase;margin-bottom:6px}
  .fld input,.fld select,.fld textarea{width:100%;background:var(--bg);border:1px solid var(--line4);color:var(--fg);padding:11px 12px;font-family:'Martian Mono',monospace;font-size:13px;border-radius:0}
  .fld textarea{resize:vertical;font-family:'Space Grotesk',sans-serif}
  .fld input:focus,.fld select:focus,.fld textarea:focus{outline:none;border-color:var(--sig)}
  .modal-msg{font-family:'Martian Mono',monospace;font-size:12px;min-height:18px;margin-bottom:4px;color:var(--fg4)}
  .modal-msg.err{color:var(--sig)}
  .modal-msg.ok{color:var(--green)}
  .modal-foot{display:flex;gap:10px;justify-content:flex-end;padding:14px 22px 20px}
  .modal-foot .btn{padding:11px 20px;font-size:14px}

  .msg{background:var(--card);border:1px solid var(--line);display:flex}
  .rail{flex:0 0 auto;width:74px;border-right:1px solid var(--line2);display:flex;flex-direction:column;align-items:center;padding:18px 0;gap:6px}
  .rail .rank{font-family:'Martian Mono',monospace;font-size:12px;color:var(--fg5)}
  .likebtn{background:transparent;border:1px solid var(--line4);color:var(--fg5);width:34px;height:34px;border-radius:50%;font-size:15px;cursor:pointer;transition:transform .12s}
  .likebtn:hover{transform:scale(1.12)}
  .likebtn.liked{background:var(--sigT);border-color:var(--sig);color:var(--sig)}
  .likebtn.mining{border-color:var(--sig);color:var(--sig);animation:flick .8s infinite;cursor:progress}
  .rail .lc{font-family:'Martian Mono',monospace;font-size:15px;font-weight:600;color:var(--fg3)}
  .rail .lc.liked{color:var(--sig)}
  .msg .body{flex:1;min-width:0;padding:18px 22px 16px}
  .msg .head{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:14px}
  .cat{display:inline-flex;align-items:center;gap:7px;font-family:'Martian Mono',monospace;font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;padding:4px 9px;border:1px solid var(--fg);color:var(--fg)}
  .cat.sig{color:var(--sig);border-color:var(--sig)}
  .st{font-family:'Martian Mono',monospace;font-size:10px;font-weight:600;letter-spacing:.06em}
  .st.mem{color:var(--amber)}
  .st.conf{color:var(--green)}
  .fee{font-family:'Martian Mono',monospace;font-size:10px;font-weight:600;letter-spacing:.06em;color:var(--fg4)}
  .msg .time{font-family:'Martian Mono',monospace;font-size:11px;color:var(--fg4);margin-left:auto}
  .msg .content-btn{text-align:left;background:none;border:none;padding:0;cursor:pointer;width:100%}
  .msg .content{font-size:clamp(18px,2.4vw,23px);line-height:1.32;font-weight:500;letter-spacing:-.01em;color:var(--fg);word-break:break-word;overflow-wrap:break-word;white-space:pre-wrap;font-family:inherit;display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden}
  .msg .readmore{font-family:'Martian Mono',monospace;font-size:11px;font-weight:600;color:var(--sig);margin-top:10px}
  .msg .foot{display:flex;flex-wrap:wrap;align-items:center;gap:14px;margin-top:16px;padding-top:13px;border-top:1px solid var(--line3);font-family:'Martian Mono',monospace;font-size:11px;color:var(--fg4)}
  .msg .foot .copy{background:none;border:none;font-family:inherit;font-size:11px;color:var(--fg3);cursor:pointer;padding:0}
  .msg .foot .copy:hover{color:var(--sig)}

  .btn-more{display:block;margin:22px auto 0;border:1px solid var(--line);background:var(--card);color:var(--fg);padding:12px 26px;cursor:pointer;font-family:'Martian Mono',monospace;font-size:12px}
  .btn-more:hover{background:var(--inv-bg);color:var(--inv-fg)}
  .empty{color:var(--fg4);text-align:center;padding:60px 0;font-family:'Martian Mono',monospace;font-size:13px}

  /* detail */
  .back{background:none;border:none;font-family:'Martian Mono',monospace;font-size:12px;color:var(--fg3);cursor:pointer;margin-bottom:20px;padding:0}
  .back:hover{color:var(--sig)}
  .artifact{background:var(--card);border:1.5px solid var(--line);box-shadow:14px 14px 0 var(--line)}
  .artifact .bar{display:flex;justify-content:space-between;align-items:center;padding:14px 22px;border-bottom:1px solid var(--line);background:var(--inv-bg);color:var(--inv-fg);font-family:'Martian Mono',monospace;font-size:11px;letter-spacing:.08em}
  .artifact .bar .st.mem{color:var(--amber)}
  .artifact .bar .st.conf{color:var(--green)}
  .artifact .bar .bar-right{display:flex;align-items:center;gap:16px}
  .artifact .bar .bar-x{background:none;border:none;color:var(--inv-fg);cursor:pointer;font-size:15px;line-height:1;padding:2px 4px;opacity:.7}
  .artifact .bar .bar-x:hover{opacity:1;color:var(--sig)}
  .artifact .pad{padding:clamp(26px,5vw,52px) clamp(22px,4vw,44px)}
  .artifact blockquote{font-size:clamp(26px,5vw,46px);line-height:1.2;font-weight:600;letter-spacing:-.022em;margin:22px 0 30px;word-break:break-word;overflow-wrap:break-word}
  .artifact blockquote.med{font-size:clamp(22px,3vw,30px);line-height:1.32;font-weight:500;letter-spacing:-.01em}
  .artifact blockquote.long{font-size:clamp(16px,1.8vw,19px);line-height:1.62;font-weight:400;letter-spacing:0}
  .metagrid{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--line2);border:1px solid var(--line2);font-family:'Martian Mono',monospace}
  .metagrid .cell{background:var(--card);padding:14px 16px;min-width:0}
  .metagrid .cell.full{grid-column:1 / -1}
  .metagrid .k{font-size:10px;letter-spacing:.1em;color:var(--fg4);text-transform:uppercase}
  .metagrid .v{font-size:13px;color:var(--fg);margin-top:5px;word-break:break-all;min-width:0}
  .metagrid .v.single{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .metagrid .v a{color:var(--fg);text-decoration:underline;text-underline-offset:3px;text-decoration-color:var(--fg4)}
  .metagrid .v a:hover{color:var(--sig);text-decoration-color:var(--sig)}
  .metagrid .copyval{display:block;width:100%;background:none;border:none;padding:0;margin:0;font:inherit;color:inherit;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}
  .metagrid .copyval:hover{color:var(--sig)}
  .metagrid .copyval::after{content:'\u29c9';margin-left:8px;opacity:.45;font-size:11px}
  .artifact .actions{display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:18px 22px;border-top:1px solid var(--line)}
  .act{border:1px solid var(--fg);color:var(--fg);background:none;padding:12px 18px;font-family:'Martian Mono',monospace;font-size:12px;cursor:pointer}
  .act:hover{background:var(--fg);color:var(--bg)}
  .act-like{background:var(--fg);color:var(--bg);border-color:var(--fg);font-family:'Space Grotesk';font-size:14px;font-weight:600;padding:12px 22px}
  .act-like.liked{background:var(--sig);border-color:var(--sig);color:var(--on-sig)}
  .act-share{background:var(--sig);color:var(--on-sig);border-color:var(--sig);font-family:'Space Grotesk';font-size:14px;font-weight:600;padding:12px 20px;margin-left:auto}
  .act-share:hover{background:var(--sigH);border-color:var(--sigH);color:var(--on-sig)}
  .caption{text-align:center;font-family:'Martian Mono',monospace;font-size:11px;color:var(--fg4);margin-top:22px}
  .guide-steps{display:flex;flex-direction:column;border:1px solid var(--line);background:var(--card);margin-top:32px}
  .gstep{display:grid;grid-template-columns:auto 1fr;gap:20px;padding:24px 24px;border-bottom:1px solid var(--line2)}
  .gstep:last-child{border-bottom:none}
  .gnum{font-family:'Martian Mono',monospace;font-size:13px;font-weight:600;color:var(--on-sig);background:var(--sig);width:34px;height:34px;display:flex;align-items:center;justify-content:center}
  .gstep h3{font-size:19px;font-weight:600;letter-spacing:-.01em;margin-bottom:8px}
  .gstep p{font-size:15px;color:var(--fg3);line-height:1.5;max-width:62ch}
  .code{margin-top:14px;background:var(--inv-bg);color:var(--inv-fg);font-family:'Martian Mono',monospace;font-size:12px;line-height:1.6;padding:16px 18px;overflow-x:auto;white-space:pre}
  .callout{display:flex;gap:14px;border:1px solid var(--sig);background:var(--sigT);padding:18px 20px;margin-top:28px}
  .callout .b{font-family:'Martian Mono',monospace;font-size:11px;color:var(--sigH);letter-spacing:.08em;font-weight:600}
  .callout p{font-size:14px;color:var(--fg2);line-height:1.5}
  .gnote{font-family:'Martian Mono',monospace;font-size:12px;color:var(--fg4);margin-top:18px}

  footer{border-top:1px solid var(--line);background:var(--bg);padding:26px clamp(16px,4vw,44px);display:flex;flex-wrap:wrap;gap:14px;justify-content:space-between;align-items:center;font-family:'Martian Mono',monospace;font-size:11px;color:var(--fg4)}
  .status{color:var(--fg4);font-family:'Martian Mono',monospace;font-size:12px;text-align:center;padding:12px 0}
</style>
</head>
<body>
<div class="ticker">
  <div class="tk-badge"><span class="dot"></span>LIVE ON-CHAIN</div>
  <div class="tk-wrap"><div class="tk-track" id="ticker"></div></div>
</div>
<header>
  <button class="brand" data-action="home">
    <span class="logo">OP_RETURN</span>
    <span class="tag">The Permanent Record</span>
  </button>
  <nav>
    <button class="navbtn" data-action="feed" data-nav="feed">Feed</button>
    <button class="navbtn" data-action="collections" data-nav="collections">Collections</button>
    <button class="navbtn" data-action="guide" data-nav="guide">Etch</button>
    <button class="navbtn active" data-action="home" data-nav="landing">About</button>
  </nav>
</header>
<main id="app"></main>
<footer>
  <span>OP_RETURN &middot; opreturn.xyz</span>
  <span>DATA: mempool.space &middot; CLASSIFICATION: AI &middot; NOT FINANCIAL ADVICE</span>
  <span>created by <a href="https://x.com/xbtoshi" target="_blank" rel="noopener">@xbtoshi</a></span>
  <span id="foot-count">&mdash;</span>
</footer>

<div class="scrim" id="suggest-modal" hidden>
  <div class="modal">
    <div class="modal-head"><span>&#9670; SUGGEST AN ADDRESS</span><button class="modal-x" data-action="suggest-close" aria-label="close">&#10005;</button></div>
    <div class="modal-body">
      <p class="modal-lede">Know a Bitcoin address collecting strange OP_RETURN messages? Suggest it. Every submission is reviewed by a human before it's monitored.</p>
      <label class="fld"><span>Bitcoin address</span><input id="sug-addr" placeholder="bc1… / 1… / 3…" autocomplete="off" spellcheck="false" /></label>
      <label class="fld"><span>Collection</span><select id="sug-col"></select></label>
      <label class="fld"><span>Why this address? (optional)</span><textarea id="sug-note" rows="2" maxlength="280" placeholder="What's showing up there?"></textarea></label>
      <div class="modal-msg" id="sug-msg"></div>
    </div>
    <div class="modal-foot"><button class="btn" data-action="suggest-close">Cancel</button><button class="btn btn-primary" id="sug-submit" data-action="suggest-submit">Submit suggestion</button></div>
  </div>
</div>

<script>

(function(){
  var state={screen:'landing',filter:null,address:null,category:null,sort:'hot',liked:{},mining:{},collections:[],categories:[],feed:[],nextBefore:null,detailTx:null,from:null,cache:{}};
  var POW_BITS=16;
  var _inApp=0;
  try{state.liked=JSON.parse(localStorage.getItem('opreturn_liked')||'{}');}catch(e){}

  var app=document.getElementById('app');
  var HOSTILE={'Prompt Injection':1,'Threats / Hostility':1,'Laundry / Service Ads':1};

  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
  function attr(s){return esc(s);}
  function shortAddr(a){a=String(a||'');return a.length>16?a.slice(0,10)+'\\u2026'+a.slice(-4):a;}
  function catCode(c){return 'COL-'+('0'+c).slice(-2);}
  function timeAgo(ts){if(ts==null||ts==='')return '';var ms=typeof ts==='number'?ts*1000:new Date(String(ts).replace(' ','T')+(String(ts).indexOf('Z')<0?'Z':'')).getTime();if(isNaN(ms))return '';var diff=(Date.now()-ms)/60000;if(diff<1)return 'just now';if(diff<60)return Math.floor(diff)+'m ago';if(diff<1440)return Math.floor(diff/60)+'h ago';return Math.floor(diff/1440)+'d ago';}
  function msgTime(m){return m.block_time!=null?m.block_time:m.created_at;}
  function isHot(c){return c.message_count>=100;}
  function feeText(m){if(m.fee_rate!=null)return m.fee_rate+' sat/vB';if(m.fee_sats!=null)return m.fee_sats.toLocaleString()+' sats';return '';}

  function cacheMsgs(list){list.forEach(function(m){state.cache[m.id]=m;if(m.txid)state.cache[m.txid]=m;});}
  function colName(cid){for(var i=0;i<state.collections.length;i++){if(state.collections[i].id===cid)return state.collections[i].name;}return '';}
  function colById(cid){for(var i=0;i<state.collections.length;i++){if(state.collections[i].id===cid)return state.collections[i];}return null;}
  function colBySlug(s){for(var i=0;i<state.collections.length;i++){if(state.collections[i].slug&&state.collections[i].slug.toLowerCase()===String(s).toLowerCase())return state.collections[i];}return null;}
  function colSlug(c){return c&&(c.slug||String(c.id))||'';}
  function catSlug(c){return String(c||'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').replace(/--+/g,'-');}
  function catName(slug){for(var i=0;i<state.categories.length;i++){if(catSlug(state.categories[i].category)===String(slug).toLowerCase())return state.categories[i].category;}return null;}

  function fetchJSON(u,o){return fetch(u,o).then(function(r){return r.json().then(function(d){return {status:r.status,d:d};});});}

  function loadCollections(){return fetchJSON('/api/collections').then(function(r){state.collections=r.d||[];});}
  function loadCategories(){return fetchJSON('/api/categories').then(function(r){state.categories=r.d||[];});}
  function loadFeed(append){
    var q='/api/messages?sort='+state.sort+'&limit=50';
    if(state.filter)q+='&collection_id='+state.filter;
    if(state.address)q+='&address='+encodeURIComponent(state.address);
    if(state.category)q+='&category='+encodeURIComponent(catSlug(state.category));
    if(append&&state.nextBefore)q+='&before='+state.nextBefore;
    return fetchJSON(q).then(function(r){
      var msgs=(r.d&&r.d.messages)||[];cacheMsgs(msgs);
      state.feed=append?state.feed.concat(msgs):msgs;
      state.nextBefore=r.d?r.d.next_before:null;
    });
  }

  function totalArchived(){var t=0;state.collections.forEach(function(c){t+=c.message_count||0;});return t;}
  function totalAddresses(){var t=0;state.collections.forEach(function(c){t+=c.address_count||0;});return t;}

  function setNav(){
    var r=currentRoute().name;
    var nav=(r==='c'||r==='a'||r==='cat'||r==='feed'||r==='m')?'feed':(r==='collections'?'collections':(r==='guide'?'guide':'landing'));
    var b=document.querySelectorAll('[data-nav]');
    for(var i=0;i<b.length;i++){b[i].classList.toggle('active',b[i].getAttribute('data-nav')===nav);}
  }
  function setFootAndTicker(){
    document.getElementById('foot-count').textContent=totalArchived().toLocaleString()+' ARCHIVED';
    var src=state.feed.length?state.feed:Object.keys(state.cache).map(function(k){return state.cache[k];});
    var t=src.slice(0,12).map(function(m){var c=String(m.content||'').slice(0,60);return '  \\u25c6  '+c+(String(m.content||'').length>60?'\\u2026':'')+'  \\u00b7  '+(m.is_mempool?'MEMPOOL':'CONFIRMED');}).join('');
    document.getElementById('ticker').innerHTML='<span>'+esc(t)+'</span><span>'+esc(t)+'</span>';
  }

  /* ---- screen renderers ---- */
  function renderLanding(){
    var feat=null;var all=Object.keys(state.cache).map(function(k){return state.cache[k];});
    all.forEach(function(m){if(!feat||m.likes>feat.likes)feat=m;});
    var h='<section class="wrap" style="padding-bottom:clamp(30px,4vw,56px)">';
    h+='<div class="pill"><span class="dot"></span>'+totalArchived().toLocaleString()+' MESSAGES ARCHIVED \\u00b7 UPDATING EVERY BLOCK</div>';
    h+='<h1 class="hero">People are leaving messages inside Bitcoin. Forever.</h1>';
    h+='<p class="lede">Every one of these was etched into an <span class="mono" style="font-size:.85em">OP_RETURN</span> output on the blockchain \\u2014 threats, confessions, prayers, ads, haiku. Immutable. Unstoppable. We monitor the strangest addresses on the network and archive what shows up.</p>';
    h+='<div class="cta"><button class="btn btn-primary" data-action="feed">Enter the feed \\u2192</button><button class="btn" data-action="collections">Browse collections</button></div>';
    h+='<p class="mono" style="margin-top:20px;font-size:13px;color:var(--fg4)">Want to leave your own mark? <button data-action="guide" style="background:none;border:none;color:var(--sig);font:inherit;cursor:pointer;padding:0;text-decoration:underline">Read the field manual \\u2192</button></p>';
    h+='</section>';
    if(feat){
      h+='<section class="featured" data-action="open-msg" data-txid="'+attr(feat.txid)+'" style="cursor:pointer"><div class="inner"><div class="k">\u25c6 TRANSMISSION OF THE DAY</div>';
      h+='<blockquote>\u201c'+esc(feat.content)+'\u201d</blockquote>';
      h+='<div class="meta"><span class="strong">\u21b3 '+esc(colName(feat.collection_id))+'</span><span>'+esc(timeAgo(msgTime(feat)))+'</span><span>'+esc(shortAddr(feat.address))+'</span><span class="sig">\u2665 '+feat.likes+'</span></div>';
      h+='</div></section>';
    }
    h+='<section class="wrap" style="padding-top:clamp(32px,5vw,64px)"><div class="stats">';
    h+=stat(String(state.collections.length),'Collections tracked');
    h+=stat(totalAddresses()+'','Addresses monitored');
    h+=stat('~3min','Fresh every poll');
    h+=stat('\\u221e','Years it stays online');
    h+='</div>';
    h+=renderChart();
    h+='</section>';
    app.innerHTML=h;
  }
  function stat(v,l){return '<div class="stat"><div class="v">'+esc(v)+'</div><div class="l">'+esc(l)+'</div></div>';}
  function categoryTally(){var counts={};var all=Object.keys(state.cache).map(function(k){return state.cache[k];});all.forEach(function(m){var c=m.category||'Other';counts[c]=(counts[c]||0)+1;});var arr=Object.keys(counts).map(function(k){return {cat:k,n:counts[k]};});arr.sort(function(a,b){return b.n-a.n;});return arr;}
  function renderChart(){var arr=categoryTally();if(!arr.length)return '';var max=arr[0].n||1;var h='<div class="chart"><div class="kicker" style="margin-bottom:16px">\u25c6 WHAT THEY\u2019RE SAYING \u00b7 BY CATEGORY</div>';arr.forEach(function(r){var hostile=HOSTILE[r.cat];var pct=Math.max(5,Math.round(r.n/max*100));h+='<div class="chart-row"><div class="chart-label">'+esc(r.cat)+'</div><div class="chart-track"><div class="chart-fill'+(hostile?' sig':'')+'" style="width:'+pct+'%"></div></div><div class="chart-num">'+r.n+'</div></div>';});h+='</div>';return h;}

  function renderCollections(){
    var h='<section class="wrap"><div class="kicker">\u25c6 ARCHIVE INDEX</div><h2 class="title">Collections</h2>';
    h+='<p class="lede" style="margin-top:12px;font-size:17px">Addresses grouped by the phenomenon behind them. Each collection is a running record of a specific pattern we\u2019ve watched unfold on-chain.</p>';
    h+='<div class="suggest-bar" style="margin-top:24px"><button class="btn-sm" data-action="suggest-open" data-col="">+ Suggest an address</button></div>';
    h+='<div class="col-grid" style="margin-top:34px">';
    state.collections.forEach(function(c,i){
      h+='<a class="col-card" href="/c/'+attr(colSlug(c))+'">';
      h+='<div class="top"><span class="code">'+catCode(i+1)+'</span>'+(isHot(c)?'<span class="hot">\u25b2 HOT</span>':'')+'</div>';
      h+='<div class="name">'+esc(c.name)+'</div>';
      h+='<div class="desc">'+esc(c.description||'')+'</div>';
      h+='<div class="foot"><span>'+(c.address_count||0)+' addr</span><span>'+(c.message_count||0)+' msgs</span><span class="read">read \u2192</span></div>';
      h+='</a>';
    });
    h+='</div></section>';
    app.innerHTML=h;
  }

  function msgHTML(m,rank){
    var liked=!!state.liked[m.id];
    var hostile=HOSTILE[m.category];
    var h='<article class="msg">';
    h+='<div class="rail"><span class="rank">'+(rank!=null?'#'+(rank+1):'')+'</span>';
    h+='<button class="likebtn'+(liked?' liked':'')+'" data-action="like" data-id="'+m.id+'">\\u2665</button>';
    h+='<span class="lc'+(liked?' liked':'')+'" data-lc="'+m.id+'">'+m.likes+'</span></div>';
    h+='<div class="body"><div class="head">';
    h+=(m.category?'<a class="cat'+(hostile?' sig':'')+'" href="/cat/'+encodeURIComponent(catSlug(m.category))+'">'+esc(m.category)+'</a>':'<span class="cat'+(hostile?' sig':'')+'">Unclassified</span>');
    h+='<span class="st '+(m.is_mempool?'mem':'conf')+'">'+(m.is_mempool?'\\u25f7 IN MEMPOOL':'\\u2713 CONFIRMED')+'</span>';
    h+='<span class="fee">'+esc(feeText(m))+'</span>';
    if(m.dup_count>1)h+='<span class="fee" title="Same message broadcast in '+m.dup_count+' separate transactions">\\u00d7'+m.dup_count+' txs</span>';
    h+='<span class="time">'+esc(timeAgo(msgTime(m)))+'</span></div>';
    h+='<button class="content-btn" data-action="open-msg" data-txid="'+attr(m.txid)+'"><p class="content">'+esc(m.content)+'</p>'+((m.content||'').length>280?'<div class="readmore">\\u2026 read full message \\u2192</div>':'')+'</button>';
    h+='<div class="foot">';
    if(m.collection_id){h+='<span>\u21b3 <a href="/c/'+attr(colSlug(colById(m.collection_id)))+'">'+esc(colName(m.collection_id))+'</a></span>';}
    h+='<a href="/a/'+attr(m.address)+'">'+esc(shortAddr(m.address))+'</a>';
    h+='<button class="copy" data-action="copy" data-copy="'+attr(m.address)+'">\u29c9</button>';
    h+='<a href="https://mempool.space/tx/'+attr(m.txid)+'" target="_blank" rel="noopener">txid \u2197</a></div>';
    h+='</div></article>';
    return h;
  }

  function renderFeed(){
    var title=state.address?state.address:(state.filter?colName(state.filter):(state.category?state.category:'All transmissions'));
    var kick=state.address?'\u25c6 ADDRESS RECORD':(state.filter?('\u25c6 '+catCode(colIndex(state.filter)+1)):(state.category?('\u25c6 '+catSlug(state.category).toUpperCase().replace(/-/g,' ')):'\u25c6 EVERY MONITORED ADDRESS'));
    var h='<section class="wrap wrap-narrow"><div class="feed-head"><div><div class="kicker" style="margin-bottom:6px">'+kick+'</div><h2 class="title" style="font-size:clamp(26px,4vw,40px);word-break:break-all">'+esc(title)+'</h2></div>';
    h+='<div class="seg"><button data-action="sort" data-sort="hot" class="'+(state.sort==='hot'?'active':'')+'">\ud83d\udd25 Hottest</button><button data-action="sort" data-sort="new" class="'+(state.sort==='new'?'active':'')+'">\u25f7 Newest</button></div></div>';
    h+='<div class="chips"><a class="chip'+(state.filter==null&&!state.address&&!state.category?' active':'')+'" href="/feed">All transmissions</a>';
    state.collections.forEach(function(c){h+='<a class="chip'+(state.filter===c.id&&!state.address&&!state.category?' active':'')+'" href="/c/'+attr(colSlug(c))+'">'+esc(c.name)+'</a>';});
    h+='</div>';
    if(state.categories.length){h+='<div class="chips" style="margin-top:8px">';
    h+='<a class="chip'+(state.category==null&&!state.address?' active':'')+'" href="/feed">All categories</a>';
    state.categories.forEach(function(c){h+='<a class="chip'+(state.category===c.category&&!state.address?' active':'')+'" href="/cat/'+encodeURIComponent(c.slug)+'">'+esc(c.category)+'</a>';});
    h+='</div>';}
    h+='<div class="suggest-bar"><button class="btn-sm" data-action="suggest-open" data-col="'+(state.filter||'')+'">+ Suggest an address'+(state.filter?' for this collection':'')+'</button></div>';
    h+='<div class="feed-list" id="feed-list">';
    if(!state.feed.length){h+='<div class="empty">No messages yet \\u2014 waiting for the next poll.</div>';}
    else{state.feed.forEach(function(m,i){h+=msgHTML(m,state.sort==='hot'?i:null);});}
    h+='</div>';
    if(state.nextBefore){h+='<button class="btn-more" data-action="more">Load more \\u2193</button>';}
    h+='<div class="status" id="status"></div></section>';
    app.innerHTML=h;
  }
  function colIndex(id){for(var i=0;i<state.collections.length;i++){if(state.collections[i].id===id)return i;}return 0;}

  function renderDetail(){
    var m=state.cache[state.detailTx];if(!m){go('feed');return;}
    var liked=!!state.liked[m.id];var hostile=HOSTILE[m.category];
    var h='<section class="wrap wrap-card"><button class="back" data-action="back">\\u2190 back</button>';
    h+='<div class="artifact"><div class="bar"><span>\\u25c6 OP_RETURN \\u00b7 IMMUTABLE RECORD</span><span class="bar-right"><span class="st '+(m.is_mempool?'mem':'conf')+'">'+(m.is_mempool?'\\u25f7 IN MEMPOOL':'\\u2713 CONFIRMED')+'</span><button class="bar-x" data-action="back" aria-label="close" title="close">\\u2715</button></span></div>';
    h+='<div class="pad"><span class="cat'+(hostile?' sig':'')+'">'+esc(m.category||'Unclassified')+'</span>';
    var qlen=(m.content||'').length;var qcls=qlen>600?' long':(qlen>240?' med':'');
    h+='<blockquote class="'+qcls.trim()+'">\\u201c'+esc(m.content)+'\\u201d</blockquote>';
    h+='<div class="metagrid">';
    if(m.collection_id){h+='<div class="cell full"><div class="k">Collection</div><div class="v single"><a href="/c/'+attr(colSlug(colById(m.collection_id)))+'">'+esc(colName(m.collection_id))+'</a></div></div>';}
    h+=cellCopy('Address',m.address);
    h+=cellCopy('Transaction',m.txid);
    h+=cell('Status',m.is_mempool?'pending':'confirmed');
    h+=cell('Fee',feeText(m)||'\\u2014');
    h+=cell('Size',(function(){try{return new TextEncoder().encode(m.content||'').length+' bytes';}catch(e){return (m.content||'').length+' chars';}})());
    h+=cell('Time',timeAgo(msgTime(m)));
    h+=(m.category?'<div class="cell"><div class="k">Category</div><div class="v single"><a href="/cat/'+encodeURIComponent(catSlug(m.category))+'">'+esc(m.category)+'</a></div></div>':cell('Category','unclassified'));
    // Total fee cell carries an async fiat span (filled from mempool historical-price)
    h+='<div class="cell"><div class="k">Total fee</div><div class="v">'+(m.fee_sats!=null?('<span style="white-space:nowrap" title="'+m.fee_sats.toLocaleString()+' sats">'+fmtSats(m.fee_sats)+' sats</span> <span id="feeusd" style="color:var(--fg4);white-space:nowrap;font-size:11px"></span>'):'\\u2014')+'</div></div>';
    h+=cell('Block',m.is_mempool?'in mempool':(m.block_time!=null?new Date(m.block_time*1000).toISOString().slice(0,10):'\\u2014'));
    h+='</div></div>';
    h+='<div class="actions"><button class="act act-like'+(liked?' liked':'')+'" data-action="like" data-id="'+m.id+'">\\u2665 <span data-lc="'+m.id+'">'+m.likes+'</span> likes</button>';
    h+='<button class="act" data-action="copy" data-copy="'+attr(m.address)+'">Copy address \\u29c9</button>';
    h+='<a class="act" href="https://mempool.space/tx/'+attr(m.txid)+'" target="_blank" rel="noopener">View on mempool \\u2197</a>';
    h+='<button class="act act-share" data-action="share">Share this \\u2197</button></div>';
    h+='</div><p class="caption">Etched into the Bitcoin blockchain. It cannot be deleted, edited, or taken down.</p></section>';
    app.innerHTML=h;
    if(m.fee_sats!=null)fillFeeUsd(m);
  }
  function fmtSats(n){
    if(n>=1e6)return (n/1e6).toFixed(2).replace(/\\.?0+$/,'')+'M';
    if(n>=1e4)return (n/1e3).toFixed(1).replace(/\\.0$/,'')+'K';
    return n.toLocaleString();
  }
  function fillFeeUsd(m){
    var ts=m.block_time||Math.floor(Date.now()/1000);
    fetch('/api/price?ts='+ts).then(function(r){return r.json();}).then(function(d){
      var p=d&&d.usd;if(!p)return;
      var usd=m.fee_sats/1e8*p;var el=document.getElementById('feeusd');
      if(el)el.textContent='\\u2248 $'+(usd<0.01?usd.toFixed(4):usd.toFixed(2));
    }).catch(function(){});
  }
  function cell(k,v){return '<div class="cell"><div class="k">'+esc(k)+'</div><div class="v">'+esc(v)+'</div></div>';}
  function mid(s,n){s=String(s||'');if(s.length<=n)return s;var h=Math.max(6,Math.floor((n-3)/2));return s.slice(0,h)+'\\u2026'+s.slice(-h);}
  function cellCopy(k,v){return '<div class="cell"><div class="k">'+esc(k)+'</div><div class="v"><button class="copyval" data-action="copy" data-copy="'+attr(v)+'" title="copy">'+esc(mid(v,26))+'</button></div></div>';}
  function gstep(n,t,b){return '<div class="gstep"><div class="gnum">'+n+'</div><div><h3>'+t+'</h3><p>'+b+'</p></div></div>';}
  function renderGuide(){
    var code=[
      "# Bitcoin Core \\u2014 attach arbitrary data (80+ bytes now relay by default)",
      "DATA=$(printf 'gm, permanent record' | xxd -p -c 999)",
      "bitcoin-cli -named createrawtransaction \\\\",
      "  inputs='[{\\"txid\\":\\"<your-utxo>\\",\\"vout\\":0}]' \\\\",
      "  outputs='[{\\"data\\":\\"'$DATA'\\"},{\\"<change-addr>\\":0.0009}]'",
      "# then: signrawtransactionwithwallet + sendrawtransaction"
    ].join('\\n');
    var h='<section class="wrap wrap-narrow">';
    h+='<div class="kicker">\\u25c6 FIELD MANUAL</div><h2 class="title">Etch a message onto Bitcoin</h2>';
    h+='<p class="lede" style="margin-top:12px;font-size:17px">An <span class="mono" style="font-size:.85em">OP_RETURN</span> output lets you attach a small piece of arbitrary data to a Bitcoin transaction. Miners record it in the blockchain like any other transaction \\u2014 which means once it confirms, it is public and permanent.</p>';
    h+='<div class="callout"><div><div class="b">\\u26a0 BEFORE YOU DO THIS</div><p style="margin-top:6px">There is no undo. Anything you write is public forever, tied to your transaction, and costs a real fee. Never include anything private, illegal, or that identifies you unless you intend to.</p></div></div>';
    h+='<div class="guide-steps">';
    h+=gstep('01','Understand the tradeoff','OP_RETURN attaches data to a provably-unspendable output. The old 80-byte cap was a relay policy, not a consensus rule \\u2014 Bitcoin Core v30 (2025) dropped that default, so larger payloads now relay and confirm, and a message can span several OP_RETURN outputs. It is cheap but not free \\u2014 you pay a fee that scales with size \\u2014 and it is immutable once mined.');
    h+=gstep('02','Use a wallet that supports it','Sparrow Wallet (Tools \\u2192 add an OP_RETURN output), Bitcoin Core via <span class="mono" style="font-size:.9em">bitcoin-cli</span>, or Electrum\\u2019s console. Custodial and exchange wallets will not let you.');
    h+=gstep('03','Write your message','Plain UTF-8 text. There is no longer a hard 80-byte limit, but bigger data costs a higher fee and some nodes still run tighter relay limits \\u2014 keep it short for reliability, or split it across outputs. Then encode it to hex.');
    h+=gstep('04','Build the transaction','Add one OP_RETURN output carrying your data (0 sats) plus a change output back to yourself, and set a fee rate from mempool.space.'+'<div class="code">'+esc(code)+'</div>');
    h+=gstep('05','Broadcast and wait','Sign, broadcast, and watch it hit the mempool. Once a block confirms it, it lives on-chain forever. Send it to an address we monitor and it shows up in the feed here.');
    h+='</div>';
    h+='<p class="gnote">This tool only reads the chain \\u2014 it never asks for your keys and cannot send anything for you.</p>';
    h+='<div class="cta" style="margin-top:26px"><button class="btn btn-primary" data-action="feed">See what others have written \\u2192</button></div>';
    h+='</section>';
    app.innerHTML=h;
  }

  function render(){
    setNav();
    if(state.screen==='landing')renderLanding();
    else if(state.screen==='collections')renderCollections();
    else if(state.screen==='feed')renderFeed();
    else if(state.screen==='guide')renderGuide();
    else if(state.screen==='detail')renderDetail();
    setFootAndTicker();
  }

  /* ---- path routing: / , /feed , /collections , /guide ,
          /c/<slug> , /a/<address> , /m/<txid> ---- */
  function currentRoute(){
    var parts=location.pathname.split('/').filter(Boolean);
    return {name:parts[0]||'landing',param:decodeURIComponent(parts.slice(1).join('/'))||null};
  }
  function route(){
    var r=currentRoute();
    var sort=new URLSearchParams(location.search).get('sort')==='new'?'new':'hot';
    state.filter=null;state.address=null;state.category=null;
    if(r.name==='collections'){state.screen='collections';return render();}
    if(r.name==='guide'){state.screen='guide';return render();}
    if(r.name==='feed'){state.screen='feed';state.sort=sort;state.nextBefore=null;return loadFeed(false).then(render);}
    if(r.name==='c'){var col=colById(Number(r.param))||colBySlug(r.param);if(col){state.screen='feed';state.filter=col.id;state.sort=sort;state.nextBefore=null;return loadFeed(false).then(render);}}
    if(r.name==='cat'){var cn=catName(r.param);if(cn){state.screen='feed';state.category=cn;state.sort=sort;state.nextBefore=null;return loadFeed(false).then(render);}}
    if(r.name==='a'&&r.param){state.screen='feed';state.address=r.param;state.sort=sort;state.nextBefore=null;return loadFeed(false).then(render);}
    if(r.name==='m'&&r.param){state.screen='detail';state.detailTx=r.param;return ensureDetail().then(render);}
    state.screen='landing';
    // Landing builds the featured message + category chart from state.cache,
    // which only loadFeed() fills — so a fresh page load would miss them.
    return (Object.keys(state.cache).length ? Promise.resolve() : loadFeed(false)).then(render);
  }
  function go(screen,param){
    var target='/';
    if(screen==='feed')target='/feed';
    else if(screen==='collections')target='/collections';
    else if(screen==='guide')target='/guide';
    else if(screen==='detail')target='/m/'+param;
    else if(screen==='colfeed')target='/c/'+attr(colSlug(colById(Number(param)))||param);
    else if(screen==='catfeed')target='/cat/'+encodeURIComponent(catSlug(param));
    else if(screen==='addrfeed')target='/a/'+encodeURIComponent(param);
    navigate(target);
  }
  function navigate(path){
    if(location.pathname===path)route();else{history.pushState({},'',path);_inApp++;route();}
  }
  function goBack(){
    if(_inApp>0){_inApp--;history.back();}else{go('feed');}
  }
  function ensureDetail(){
    var tx=state.detailTx;
    if(state.cache[tx])return Promise.resolve();
    return fetchJSON('/api/message/'+tx).then(function(r){if(r.status===200&&r.d&&r.d.id)cacheMsgs([r.d]);});
  }

  /* ---- events ---- */
  document.addEventListener('click',function(e){
    var t=e.target.closest?e.target.closest('[data-action]'):null;
    var a=t?t.getAttribute('data-action'):null;
    if(!a){
      var link=e.target.closest?e.target.closest('a[href^="/"]'):null;
      if(link){var href=link.getAttribute('href');if(href&&href.indexOf('/api/')!==0){e.preventDefault();navigate(href);}}
      return;
    }
    if(a==='home')return go('landing');
    if(a==='feed')return go('feed');
    if(a==='collections')return go('collections');
    if(a==='guide')return go('guide');
    if(a==='back')return goBack();
    if(a==='open-collection')return go('colfeed',t.getAttribute('data-id'));
    if(a==='filter')return go('colfeed',t.getAttribute('data-id'));
    if(a==='filter-all')return go('feed');
    if(a==='sort'){var s=t.getAttribute('data-sort');history.replaceState({},'',location.pathname+(s==='new'?'?sort=new':''));route();return;}
    if(a==='more'){loadFeed(true).then(render);return;}
    if(a==='open-msg')return go('detail',t.getAttribute('data-txid'));
    if(a==='like'){like(Number(t.getAttribute('data-id')),t);return;}
    if(a==='copy'){copy(t.getAttribute('data-copy'),t);return;}
    if(a==='share'){share(t);return;}
    if(a==='suggest-open'){openSuggest(t.getAttribute('data-col'));return;}
    if(a==='suggest-close'){closeSuggest();return;}
    if(a==='suggest-submit'){submitSuggest();return;}
  });

  var _sm=document.getElementById('suggest-modal');
  if(_sm)_sm.addEventListener('click',function(e){if(e.target===this)closeSuggest();});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')closeSuggest();});

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
  function markMining(id){
    var btns=document.querySelectorAll('[data-action="like"][data-id="'+id+'"]');
    for(var i=0;i<btns.length;i++){btns[i].classList.add('mining');btns[i].innerHTML='\\u26cf';}
    setMineStatus(0);
  }
  function like(id){
    if(state.liked[id]||state.mining[id])return;
    state.mining[id]=true;markMining(id);
    mineAsync(String(id),setMineStatus).then(function(pow){
      return fetchJSON('/api/like',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message_id:id,nonce:pow.nonce,pow:pow.hash})});
    }).then(function(res){
      state.mining[id]=false;
      if((res.d&&res.d.ok)||res.status===409){
        state.liked[id]=true;localStorage.setItem('opreturn_liked',JSON.stringify(state.liked));
        if(typeof res.d.likes==='number'){if(state.cache[id])state.cache[id].likes=res.d.likes;state.feed.forEach(function(m){if(m.id===id)m.likes=res.d.likes;});}
      }
      render();
    }).catch(function(){state.mining[id]=false;render();});
  }
  function copy(txt,btn){try{navigator.clipboard.writeText(txt);var old=btn.textContent;btn.textContent='copied \\u2713';setTimeout(function(){render();},1100);}catch(e){}}
  function share(btn){try{navigator.clipboard.writeText(location.href);btn.textContent='\u2713 Link copied';setTimeout(function(){btn.textContent='Share this \u2197';},1600);}catch(e){}}

  /* ---- suggest an address (public queue → admin review) ---- */
  var ADDR_RE=/^(bc1[a-z0-9]{6,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,39})$/;
  function setSugMsg(t,cls){var el=document.getElementById('sug-msg');if(el){el.textContent=t;el.className='modal-msg'+(cls?' '+cls:'');}}
  function openSuggest(colId){
    var sel=document.getElementById('sug-col');
    sel.innerHTML=state.collections.map(function(c){return '<option value="'+c.id+'"'+(String(c.id)===String(colId)?' selected':'')+'>'+esc(c.name)+'</option>';}).join('');
    document.getElementById('sug-addr').value='';document.getElementById('sug-note').value='';setSugMsg('','');
    var b=document.getElementById('sug-submit');b.disabled=false;b.textContent='Submit suggestion';
    document.getElementById('suggest-modal').hidden=false;
    setTimeout(function(){var a=document.getElementById('sug-addr');if(a)a.focus();},30);
  }
  function closeSuggest(){var m=document.getElementById('suggest-modal');if(m)m.hidden=true;}
  function submitSuggest(){
    var addr=document.getElementById('sug-addr').value.trim();
    var colId=Number(document.getElementById('sug-col').value)||null;
    var note=document.getElementById('sug-note').value.trim();
    if(!ADDR_RE.test(addr)){setSugMsg('That doesn\u2019t look like a Bitcoin address.','err');return;}
    var b=document.getElementById('sug-submit');b.disabled=true;
    setSugMsg('\u26cf mining proof-of-work\u2026','');
    mineAsync(addr,function(n){setSugMsg('\u26cf mining proof-of-work\u2026 '+n.toLocaleString()+' hashes','');}).then(function(pow){
      return fetchJSON('/api/suggest',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({address:addr,collection_id:colId,note:note,nonce:pow.nonce,pow:pow.hash})});
    }).then(function(res){
      b.disabled=false;
      if(res.status===200&&res.d&&res.d.ok){setSugMsg('\u2713 Submitted for review. Thank you.','ok');b.textContent='Submitted';setTimeout(closeSuggest,1500);}
      else if(res.status===409){setSugMsg('This address is already '+((res.d&&res.d.error==='already monitored')?'monitored.':'in the review queue.'),'err');}
      else{setSugMsg((res.d&&res.d.error)||'Something went wrong \u2014 try again.','err');}
    }).catch(function(){b.disabled=false;setSugMsg('Network error \u2014 try again.','err');});
  }

  /* ---- boot ---- */
  loadCollections().then(function(){
    return loadCategories();
  }).then(function(){
    route();
    window.addEventListener('popstate',route);
  });
})();
</script>
</body>
</html>
`;
}
