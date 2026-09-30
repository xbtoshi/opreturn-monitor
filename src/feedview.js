/**
 * Shared view renderer for feed-style screens (/feed, /c, /a, /p, /tick,
 * /block, /cat), the message page (/m) and chat rooms (/rooms, /c/…/chat,
 * /a/…/chat), used verbatim by the Worker for the server-rendered page and by
 * the inline client script after the assembler inlines this file.
 *
 * Rules: no imports, no DOM, no globals. Every function that needs page state
 * takes a view object `s` (the client's state plus `pathname`/`search`).
 * Keep it ES2015: the same bytes run in the browser and in the Worker.
 * `test/feedview.test.ts` asserts the inlined copy in src/ui.ts renders
 * byte-identically to this module.
 */
var FV = (function () {
  var HOSTILE = { 'Prompt Injection': 1, 'Threats / Hostility': 1, 'Laundry / Service Ads': 1 };

  /* ---- pure helpers ---- */
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function attr(s) { return esc(s); }
  function fmt(n) { return Number(n || 0).toLocaleString('en-US'); }
  function shortAddr(a) { a = String(a || ''); return a.length > 16 ? a.slice(0, 10) + '…' + a.slice(-4) : a; }
  function catCode(c) { return 'COL-' + ('0' + c).slice(-2); }
  function timeAgo(ts, now) {
    if (ts == null || ts === '') return '';
    var ms = typeof ts === 'number' ? ts * 1000 : new Date(String(ts).replace(' ', 'T') + (String(ts).indexOf('Z') < 0 ? 'Z' : '')).getTime();
    if (isNaN(ms)) return '';
    var diff = ((now || Date.now()) - ms) / 60000;
    if (diff < 1) return 'just now';
    if (diff < 60) return Math.floor(diff) + 'm ago';
    if (diff < 1440) return Math.floor(diff / 60) + 'h ago';
    return Math.floor(diff / 1440) + 'd ago';
  }
  function msgTime(m) { return m.block_time != null ? m.block_time : m.created_at; }
  function tsOf(m) { if (m.block_time != null) return m.block_time; var t = new Date(String(m.created_at || '').replace(' ', 'T') + 'Z').getTime(); return isNaN(t) ? 0 : Math.floor(t / 1000); }
  function feeText(m) { if (m.fee_rate != null) return m.fee_rate + ' sat/vB'; if (m.fee_sats != null) return fmt(m.fee_sats) + ' sats'; return ''; }
  function whenText(m, now) { if (m.is_mempool) { var ago = timeAgo(m.created_at, now); return '◷ mempool · ' + (ago === 'just now' ? 'now' : ago.replace(' ago', '')); } return timeAgo(msgTime(m), now); }
  function shortCol(c) { if (!c) return ''; var n = String(c.name).replace(/ Bulletin Board$| Notices$| Marking Campaign$| & Digital Graffiti$/, ''); if (/^Genesis/.test(n)) n = 'Genesis tribute'; if (/^Russian/.test(n)) n = 'Russian intel marking'; return n.length > 28 ? n.slice(0, 26) + '…' : n; }
  function colSlug(c) { return (c && (c.slug || String(c.id))) || ''; }
  function catSlug(c) { return String(c || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/--+/g, '-'); }
  function catDot(c) { return HOSTILE[c] ? 'sig' : (c === 'Other' || !c ? 'mute' : ''); }
  var PROTO_LABEL = { text: 'Message', binary: 'Binary', runes: 'Runes', omni: 'Omni Layer', thorchain: 'THORChain', 'bridge-memo': 'Bridge memo', 'evm-hash': 'EVM hash', 'witness-commitment': 'Witness commitment', rootstock: 'Rootstock', 'core-dao': 'Core DAO', exsat: 'exSat', stacks: 'Stacks', syscoin: 'Syscoin', lifi: 'LI.FI', 'data-uri': 'Inline file', nft: 'NFT', satflow: 'SATFLOW', 'brc20-prog': 'BRC20PROG', dio: 'DIO', alpn: 'ALPN', hash: 'Hash', pw: 'PW family', tag: 'Tag', counterparty: 'Counterparty', vlgr: 'VLGR', atlnotice: 'atlnotice', bernstein: 'Bernstein', anchor: 'Anchor', 'cb-hash': 'CB hash', stamphash: 'StmpHash', mtld: 'MTLD', soda: 'SODA', sentinel: 'Sentinel', ledge: 'lEdge', bitfee: 'bitfee' };
  var PROTO_BLURB = { 'ico-20': 'JSON token operations such as the $LEAF mints sent to the Genesis address.', 'crc-20': 'JSON token operations such as the $LEAF mints sent to the Genesis address.', 'brc-20': 'JSON token operations.', omni: 'Omni Layer transfers, mostly Tether (USDT) simple sends.', thorchain: 'THORChain outbound (OUT:) and refund memos plus swap instructions.', 'bridge-memo': 'Cross-chain bridge memos naming the destination asset and address.', 'evm-hash': 'Bare 32-byte EVM transaction or commitment hashes.', lifi: 'LI.FI bridge routing markers.', rootstock: 'Rootstock merge-mining commitments (RSKBLOCK:).', stacks: 'Stacks block commits, leader keys and STX operations.', 'core-dao': 'Core DAO validator delegation tags.', exsat: 'exSat data-availability tags.', syscoin: 'Syscoin merge-mining commitments.', satflow: 'Bare protocol marker with no readable payload.', 'brc20-prog': 'Bare protocol marker with no readable payload.', dio: 'Bare protocol marker with no readable payload.', alpn: 'Bare protocol marker with no readable payload.', 'data-uri': 'Files etched as data: URIs, rendered inline when they are images.', nft: 'JSON NFT mints and transfers.' };
  var TOKEN_PROTO = /-20$|^src-|^orc-|^brc|^drc-|^ltc-|^nft$/;
  function protoLabel(p) { p = String(p || ''); return PROTO_LABEL[p] || p.toUpperCase(); }
  function protoBlurb(p) { return PROTO_BLURB[p] || (/-20$/.test(p) ? 'JSON token operations.' : 'Structured protocol data decoded from the OP_RETURN payload.'); }
  function isTokenProto(p) { return TOKEN_PROTO.test(String(p || '')); }
  function isProto(m) { return !!(m && m.protocol && m.protocol !== 'text'); }
  function fmtAmt(a) { if (a == null || a === '') return ''; var n = Number(a); if (!isFinite(n)) return String(a); if (Math.abs(n) >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: 8 }); return String(a); }
  function primaryOp(m) {
    if (!isProto(m)) return null;
    var ops = m.ops;
    if (!ops) { ops = []; String(m.content || '').split('\n').forEach(function (line, i) { line = line.trim(); if (line.charAt(0) !== '{') return; try { var j = JSON.parse(line); if (j && typeof j.p === 'string') ops.push({ vout: i, protocol: String(j.p).toLowerCase(), op: j.op || null, tick: j.tick || j.name || null, amount: j.amt || j.amount || null }); } catch (e) { } }); }
    for (var i = 0; i < ops.length; i++) { if (ops[i].protocol === m.protocol) return ops[i]; }
    return ops[0] || { protocol: m.protocol, op: null, tick: null, amount: null };
  }
  var RE_DATA_IMG = /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml|bmp|avif);base64,[A-Za-z0-9+\/=\s]+$/;
  var RE_DATA_ANY = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+)(?:;[a-z0-9=.-]+)*(?:;base64)?,/i;
  function splitMedia(content) {
    var lines = String(content || '').split('\n'), text = [], images = [], files = [];
    lines.forEach(function (l) {
      var t = l.trim(); var m = RE_DATA_ANY.exec(t);
      if (!m) { text.push(l); return; }
      if (RE_DATA_IMG.test(t)) images.push(t.replace(/\s+/g, '')); else files.push(m[1] + ' · ' + Math.round(t.length * 3 / 4 / 1024 * 10) / 10 + ' KB');
    });
    return { text: text.join('\n').trim(), images: images, files: files };
  }
  function mediaHTML(media) {
    var h = '';
    media.images.forEach(function (src) { h += '<div class="inline-media"><img src="' + attr(src) + '" alt="Image etched into an OP_RETURN output" loading="lazy" decoding="async"></div>'; });
    media.files.forEach(function (f) { h += '<div class="inline-media file">📎 inline file · ' + esc(f) + '</div>'; });
    return h;
  }

  /* Cryptographic envelope parser for OpenPGP & Electrum BIE1 ECIES messages */
  function parseCryptoEnvelope(content) {
    if (!content) return null;
    var text = String(content).trim();
    var hasPgpSigned = text.indexOf('-----BEGIN PGP SIGNED MESSAGE-----') !== -1;
    var hasPgpMsg = text.indexOf('-----BEGIN PGP MESSAGE-----') !== -1;
    var hasBie1 = text.indexOf('QklFMQ') !== -1;
    if (!hasPgpSigned && !hasPgpMsg && !hasBie1) return null;
    var res = { type: 'plain', leadText: '', bie1Payload: null, pgpArmor: null, isSigned: false, signer: null, signerKey: null, signerFp: null, recipient: null, recipientKey: null, raw: text };
    if (text.indexOf('-----BEGIN PGP SIGNATURE-----') !== -1) {
      res.isSigned = true;
      res.signer = 'Blockstream Security';
      res.signerKey = '4AC8CC886844A2D6';
      res.signerFp = '1176 542D A98E 71E1 3372 2EF7 4AC8 CC88 6844 A2D6';
    }
    if (hasPgpSigned) {
      var sigIdx = text.indexOf('-----BEGIN PGP SIGNATURE-----');
      var headIdx = text.indexOf('-----BEGIN PGP SIGNED MESSAGE-----');
      var body = text.slice(headIdx, sigIdx !== -1 ? sigIdx : text.length);
      var sMarker = '-----BEGIN PGP SIGNED MESSAGE-----';
      var mPos = body.indexOf(sMarker);
      if (mPos !== -1) {
        body = body.slice(mPos + sMarker.length).trim();
        if (body.indexOf('Hash:') === 0) { var nl = body.indexOf(String.fromCharCode(10)); if (nl !== -1) body = body.slice(nl + 1).trim(); }
      }
      var bMatch = body.match(/QklFMQ[A-Za-z0-9+/=]+/);
      if (bMatch) { res.type = 'bie1'; res.bie1Payload = bMatch[0]; res.leadText = body.slice(0, bMatch.index).trim(); res.recipient = 'Whitehat (bc1ql4mfu...jlte)'; }
      else { res.type = 'pgp-signed'; res.leadText = body; }
      res.pgpArmor = sigIdx !== -1 ? text.slice(sigIdx) : null;
      return res;
    }
    if (hasPgpMsg) {
      var msgIdx = text.indexOf('-----BEGIN PGP MESSAGE-----');
      var lead = text.slice(0, msgIdx).trim();
      var endIdx = text.indexOf('-----END PGP MESSAGE-----');
      var armor = text.slice(msgIdx, endIdx !== -1 ? endIdx + 25 : text.length);
      res.type = 'pgp-encrypted'; res.leadText = lead; res.pgpArmor = armor; res.recipient = 'Blockstream Security'; res.recipientKey = 'BB332D31CBA44EDF';
      return res;
    }
    if (hasBie1) {
      var bMatch2 = text.match(/QklFMQ[A-Za-z0-9+/=]+/);
      if (bMatch2) {
        res.type = 'bie1'; res.bie1Payload = bMatch2[0]; res.leadText = text.slice(0, bMatch2.index).trim(); res.recipient = 'Whitehat (bc1ql4mfu...jlte)';
        if (res.isSigned) { var sIdx = text.indexOf('-----BEGIN PGP SIGNATURE-----'); if (sIdx !== -1) res.pgpArmor = text.slice(sIdx); }
        return res;
      }
    }
    return null;
  }
  function displayText(m) { var media = splitMedia(m.content); var env = parseCryptoEnvelope(m.content); var t = media.images.length || media.files.length ? (media.text || '[inline file]') : (m.content || ''); if (env && env.leadText) t = env.leadText; else if (env && env.type === 'bie1') t = '[Electrum BIE1 ECIES encrypted payload to ' + shortAddr(m.address) + ']'; else if (env && env.type === 'pgp-encrypted') t = '[OpenPGP encrypted transmission to Blockstream Security]'; return t; }
  function opLine(m) {
    var o = primaryOp(m); if (!o) return '';
    var h = '<div class="opline">';
    if (o.op) h += '<span>' + esc(String(o.op).toLowerCase()) + '</span>';
    if (o.amount) h += '<span class="amt">' + esc(fmtAmt(o.amount)) + '</span>';
    if (o.tick) h += '<a class="tk" href="/tick/' + encodeURIComponent(o.tick) + '">$' + esc(o.tick) + '</a>';
    var to = m.recipient || (m.monitored_address && m.monitored_address !== m.sender ? m.monitored_address : null);
    if (to) h += '<span class="arrow">→</span><a href="/a/' + attr(to) + '">' + esc(shortAddr(to)) + '</a>';
    h += '</div>';
    return h;
  }
  function envBadges(m) { var env = parseCryptoEnvelope(m.content); if (!env) return ''; if (env.isSigned) return '<span class="badge" style="color:var(--green)">🛡 PGP SIGNED</span>'; if (env.type === 'bie1') return '<span class="badge" style="color:var(--amber)">⚡ BIE1 ECIES</span>'; if (env.type === 'pgp-encrypted') return '<span class="badge" style="color:#3d6e8f">🔒 PGP ENCRYPTED</span>'; return ''; }

  /* ---- view helpers (take the view `s`) ---- */
  function colById(s, cid) { var cs = s.collections || []; for (var i = 0; i < cs.length; i++) { if (cs[i].id === cid) return cs[i]; } return null; }
  function colName(s, cid) { var c = colById(s, cid); return c ? c.name : ''; }
  function colBySlug(s, slug) { var cs = s.collections || []; for (var i = 0; i < cs.length; i++) { if (cs[i].slug && cs[i].slug.toLowerCase() === String(slug).toLowerCase()) return cs[i]; } return null; }
  function colIndex(s, id) { var cs = s.collections || []; for (var i = 0; i < cs.length; i++) { if (cs[i].id === id) return i; } return 0; }
  function catName(s, slug) { var cs = s.categories || []; for (var i = 0; i < cs.length; i++) { if (catSlug(cs[i].category) === String(slug).toLowerCase()) return cs[i].category; } return null; }
  function voteGroup(s, m, big) {
    var voted = (s.voted && s.voted[m.id]) || (s.liked && s.liked[m.id] ? 'up' : null);
    var h = '<span class="vg' + (big ? ' big' : '') + '">';
    h += '<button class="up' + (voted === 'up' ? ' voted' : '') + '" data-action="vote" data-dir="up" data-id="' + m.id + '" title="Upvote (mines a proof-of-work nonce)">▲' + (big ? ' Upvote' : '') + '</button>';
    h += '<span class="score' + (voted ? ' voted' : '') + '" data-lc="' + m.id + '">' + fmt(m.likes || 0) + '</span>';
    h += '<button class="down' + (voted === 'down' ? ' voted' : '') + '" data-action="vote" data-dir="down" data-id="' + m.id + '" title="Downvote">▼</button></span>';
    return h;
  }

  /* ---- routing parity ---- */
  function routeName(pathname) { var parts = String(pathname || '/').split('/').filter(Boolean); if (parts.length > 2 && parts[parts.length - 1] === 'chat') parts = parts.slice(0, -1); return parts[0] || 'about'; }
  function defaultSort(name) { return name === 'c' || name === 'cat' || name === 'a' ? 'hot' : 'new'; }
  function query(s) { var q = {}; String(s.search || '').replace(/^\?/, '').split('&').forEach(function (kv) { if (!kv) return; var i = kv.indexOf('='); var k = decodeURIComponent(i < 0 ? kv : kv.slice(0, i)); var v = decodeURIComponent(i < 0 ? '' : kv.slice(i + 1).replace(/\+/g, ' ')); if (!(k in q)) q[k] = v; }); return q; }
  function buildQuery(q) { var parts = []; for (var k in q) { if (q[k] == null) continue; parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(q[k]).replace(/%20/g, '+')); } return parts.join('&'); }
  function withQuery(pathname, q) { var qs = buildQuery(q); return pathname + (qs ? '?' + qs : ''); }
  /** A keyset cursor is "likes:ts:id"; anything else is ignored rather than turned into a duplicate page. */
  function validCursor(raw) {
    if (typeof raw !== 'string' || !/^\d{1,12}:\d{1,12}:\d{1,12}$/.test(raw)) return null;
    // One spelling per cursor (no leading zeros), so one row window has exactly one URL.
    return raw.split(':').map(function (n) { return String(Number(n)); }).join(':');
  }
  /** Request parameters the feed needs, derived from the view the same way on both sides. `before` is the page's own cursor (from ?before=). */
  function feedParams(s) {
    return { sort: s.sort === 'hot' ? 'hot' : 'new', limit: 50, kind: s.kind === 'all' ? 'all' : 'text', collection_id: s.filter || null, address: s.address || null, category: s.category || null, protocol: s.protocol || null, tick: s.tick || null, block: s.block || null, before: validCursor(s.before) };
  }
  /** The API URL for a page: an explicit `before` (an append) wins over the page's own cursor; never both. */
  function feedQuery(s, limit, before) {
    var p = feedParams(s);
    before = before || p.before;
    var q = '/api/messages?sort=' + p.sort + '&limit=' + (limit || p.limit);
    if (p.collection_id) q += '&collection_id=' + p.collection_id;
    if (p.address) q += '&address=' + encodeURIComponent(p.address);
    if (p.category) q += '&category=' + encodeURIComponent(catSlug(p.category));
    if (p.protocol) q += '&protocol=' + encodeURIComponent(p.protocol);
    if (p.tick) q += '&tick=' + encodeURIComponent(p.tick);
    if (p.block) q += '&block=' + p.block;
    if (p.kind === 'all') q += '&kind=all';
    if (before) q += '&before=' + encodeURIComponent(before);
    return q;
  }
  function sortHref(s, sort) { var q = query(s); delete q.before; if (sort === defaultSort(routeName(s.pathname))) delete q.sort; else q.sort = sort; return withQuery(s.pathname, q); }
  function kindHref(s, kind) { var q = query(s); delete q.before; if (kind === 'all') q.kind = 'all'; else delete q.kind; var path = s.pathname; if (s.protocol || s.tick || s.block) path = '/feed'; return withQuery(path, q); }
  /** The next page of this feed as a real URL (same sort, kind and search; the next cursor). */
  function nextHref(s) { if (!s.nextBefore) return null; var q = query(s); q.before = s.nextBefore; return withQuery(s.pathname, q); }
  function withKind(s, path) { return path + (s.kind === 'all' ? '?kind=all' : ''); }
  function feedFilters(s) {
    var f = [];
    if (s.filter) f.push({ label: shortCol(colById(s, s.filter)), href: '/feed' + (s.kind === 'all' ? '?kind=all' : '') });
    if (s.category) f.push({ label: s.category, href: '/feed' });
    if (s.protocol) f.push({ label: 'Protocol: ' + s.protocol, href: '/feed?kind=all' });
    if (s.tick) f.push({ label: '$' + s.tick, href: '/feed?kind=all' });
    if (s.block) f.push({ label: 'Block #' + fmt(s.block), href: '/feed?kind=all' });
    if (s.address) f.push({ label: shortAddr(s.address), href: '/feed' });
    if (s.q) f.push({ label: '“' + s.q + '”', href: s.pathname + (s.kind === 'all' ? '?kind=all' : '') });
    return f;
  }
  function visibleFeed(s) { var q = String(s.q || '').toLowerCase(); var feed = s.feed || []; if (!q) return feed; return feed.filter(function (m) { return String(m.content || '').toLowerCase().indexOf(q) >= 0 || String(m.address || '').toLowerCase().indexOf(q) >= 0 || String(m.sender || '').toLowerCase().indexOf(q) >= 0; }); }
  function feedTitle(s) {
    if (s.address) return s.address;
    if (s.filter) return colName(s, s.filter);
    if (s.category) return s.category;
    if (s.protocol) return protoLabel(s.protocol);
    if (s.tick) return '$' + s.tick;
    if (s.block) return 'Block #' + fmt(s.block);
    return 'All transmissions';
  }
  function feedKicker(s) {
    var scope = s.kind === 'all' || s.protocol || s.tick || s.block ? 'EVERY PROTOCOL' : 'HUMAN MESSAGES';
    if (s.protocol) return (isTokenProto(s.protocol) ? 'TOKEN PROTOCOL' : 'OP_RETURN PROTOCOL') + ' · ' + s.protocol.toUpperCase();
    if (s.tick) return 'TOKEN TICKER';
    if (s.block) return 'BLOCK CENSUS';
    if (s.address) return 'ADDRESS RECORD';
    return scope + ' · ' + (s.filter ? catCode(colIndex(s, s.filter) + 1) : 'ALL COLLECTIONS');
  }

  /* ---- sidebar filters and the mobile control bar ---- */
  function filtersHTML(s, sheet) {
    var cols = s.collections || [], cats = s.categories || [];
    var h = '';
    h += '<div class="sgroup"><span class="slabel">SHOW</span><div class="seg2"><a href="' + attr(kindHref(s, 'text')) + '" class="' + (s.kind !== 'all' ? 'active' : '') + '">Messages</a><a href="' + attr(kindHref(s, 'all')) + '" class="' + (s.kind === 'all' ? 'active' : '') + '">All protocols</a></div></div>';
    if (sheet) {
      h += '<div class="grp"><span class="slabel">COLLECTION</span><div class="chips"><a class="chip' + (!s.filter ? ' active' : '') + '" href="' + attr(withKind(s, '/feed')) + '">All collections</a>';
      cols.forEach(function (c) { h += '<a class="chip' + (s.filter === c.id ? ' active' : '') + '" href="' + attr(withKind(s, '/c/' + colSlug(c))) + '">' + esc(shortCol(c)) + '</a>'; });
      h += '</div></div>';
      h += '<div class="grp"><span class="slabel">CATEGORY</span><div class="chips">';
      cats.forEach(function (c) { var a = s.category === c.category; h += '<a class="chip' + (a ? ' active' : '') + '" href="' + attr(a ? '/feed' : '/cat/' + encodeURIComponent(catSlug(c.category))) + '"><span class="dot ' + catDot(c.category) + '"></span>' + esc(c.category) + '</a>'; });
      h += '</div></div>';
      return h;
    }
    var total = cols.reduce(function (t, c) { return t + (c.message_count || 0); }, 0);
    h += '<div class="sgroup"><span class="slabel">COLLECTION</span>';
    h += '<a class="srow' + (!s.filter && !s.address ? ' active' : '') + '" href="' + attr(withKind(s, '/feed')) + '"><span class="nm">All collections</span><span class="n">' + fmt(total) + '</span></a>';
    cols.forEach(function (c) { h += '<a class="srow' + (s.filter === c.id ? ' active' : '') + '" href="' + attr(withKind(s, '/c/' + colSlug(c))) + '" title="' + attr(c.name) + '"><span class="nm">' + esc(shortCol(c)) + '</span><span class="n">' + fmt(c.message_count || 0) + '</span></a>'; });
    h += '</div>';
    if (cats.length) {
      h += '<div class="sgroup"><span class="slabel">CATEGORY</span>';
      cats.forEach(function (c) { var a = s.category === c.category; h += '<a class="srow cat' + (a ? ' active' : '') + '" href="' + attr(a ? '/feed' : '/cat/' + encodeURIComponent(catSlug(c.category))) + '"><span class="dot ' + catDot(c.category) + '"></span><span class="nm">' + esc(c.category) + '</span><span class="n">' + fmt(c.count || 0) + '</span></a>'; });
      h += '</div>';
    }
    return h;
  }
  function mobileCtlHTML(s) {
    var n = feedFilters(s).length;
    return '<div class="seg2"><a href="' + attr(sortHref(s, 'hot')) + '" class="' + (s.sort === 'hot' ? 'active' : '') + '">Hottest</a><a href="' + attr(sortHref(s, 'new')) + '" class="' + (s.sort === 'new' ? 'active' : '') + '">Newest</a></div><button class="fbtn" data-action="sheet-open">Filter' + (n ? ' · ' + n : '') + '</button>';
  }

  /* ---- rows ---- */
  function rowHTML(s, m) {
    var proto = isProto(m); var hostile = HOSTILE[m.category];
    var col = m.collection_id ? colById(s, m.collection_id) : null;
    var h = '<article class="row" data-id="' + m.id + '"><div class="meta">';
    h += '<span class="dot ' + (proto ? 'tok' : catDot(m.category)) + '"></span>';
    if (proto) h += '<a class="cat tok" href="/p/' + encodeURIComponent(m.protocol) + '">' + esc(protoLabel(m.protocol)) + '</a>';
    else if (m.category) h += '<a class="cat' + (hostile ? ' sig' : '') + '" href="/cat/' + encodeURIComponent(catSlug(m.category)) + '">' + esc(m.category) + '</a>';
    else h += '<span class="cat">Unclassified</span>';
    h += '<span class="sep">·</span>';
    if (col) h += '<a class="col" href="' + attr(withKind(s, '/c/' + colSlug(col))) + '">' + esc(shortCol(col)) + '</a>'; else h += '<span class="col">Unmonitored</span>';
    h += envBadges(m);
    if (m.dup_count > 1) h += '<span class="badge" title="Same message broadcast in ' + m.dup_count + ' transactions">×' + m.dup_count + '</span>';
    h += '<span class="when' + (m.is_mempool ? ' mem' : '') + '">' + esc(whenText(m, s.now)) + '</span></div>';
    if (proto) h += opLine(m);
    var text = displayText(m);
    h += '<h3 class="content' + (proto ? ' proto' : '') + '"><a href="/m/' + attr(m.txid) + '">' + esc(text) + '</a></h3>';
    if (text.length > 420) h += '<span class="readmore">… read full message →</span>';
    h += mediaHTML(splitMedia(m.content));
    h += '<div class="foot">' + voteGroup(s, m, false);
    h += '<span class="chain">' + (m.block_height != null ? '<a href="/block/' + m.block_height + '">#' + fmt(m.block_height) + '</a>' : 'unconfirmed') + ' · <a href="/a/' + attr(m.address) + '">' + esc(shortAddr(m.address)) + '</a>' + (feeText(m) ? ' · ' + esc(feeText(m)) : '') + '</span>';
    h += '<a class="open" href="/m/' + attr(m.txid) + '">Open →</a></div></article>';
    return h;
  }

  /* ---- page heads, tail and rail ---- */
  function protocolHeadHTML(s) {
    var p = null; (s.protocols || []).forEach(function (x) { if (x.protocol === s.protocol) p = x; });
    var ticks = (s.ticks || []).filter(function (t) { return t.protocol === s.protocol; });
    var feed = s.feed || [];
    var h = '<div class="stats"><div class="stat"><span class="v">' + fmt(p ? p.count : 0) + '</span><span class="l">Transactions, all scanned blocks</span></div><div class="stat"><span class="v">' + fmt(ticks.length) + '</span><span class="l">Tickers seen</span></div><div class="stat"><span class="v">' + (feed.length ? fmt(feed.length) + (s.nextBefore ? '+' : '') : '0') + '</span><span class="l">Loaded below</span></div></div>';
    if (ticks.length) { h += '<div class="sgroup"><span class="slabel">TICKERS ON ' + esc(s.protocol.toUpperCase()) + '</span><div class="chips">'; ticks.forEach(function (t) { h += '<a class="chip" href="/tick/' + encodeURIComponent(t.tick) + '">$' + esc(t.tick) + ' <span style="opacity:.55">' + fmt(t.count) + '</span></a>'; }); h += '</div></div>'; }
    return h;
  }
  function protocolTailHTML(s) { var ex = null; (s.feed || []).forEach(function (m) { if (!ex && m.content) ex = m; }); if (!ex) return ''; return '<div class="sgroup"><span class="slabel">RAW EXAMPLE</span><div class="rawbox">' + esc(String(ex.content).slice(0, 600)) + '</div></div>'; }
  function tickHeadHTML(s) {
    var mine = (s.ticks || []).filter(function (t) { return t.tick === s.tick; });
    var protos = mine.map(function (t) { return t.protocol; }); var total = mine.reduce(function (n, t) { return n + t.count; }, 0);
    var first = null; (s.feed || []).forEach(function (m) { if (m.block_height != null && (first == null || m.block_height < first)) first = m.block_height; });
    var h = '<p class="lede">Token ticker' + (protos.length ? ' · ' + esc(protos.map(protoLabel).join(', ')) : '') + (first != null ? ' · first seen block ' + fmt(first) + ' (of the loaded operations)' : '') + '</p>';
    h += '<div class="stats"><div class="stat"><span class="v">' + fmt(total) + '</span><span class="l">Operations, all scanned blocks</span></div>';
    mine.forEach(function (t) { h += '<a class="stat" href="/p/' + encodeURIComponent(t.protocol) + '"><span class="v">' + fmt(t.count) + '</span><span class="l">via ' + esc(protoLabel(t.protocol)) + '</span></a>'; });
    h += '</div>';
    return h;
  }
  function blockHeadHTML(s) {
    var b = s.blockRow; var hh = s.block;
    var h = '<div class="pills"><a class="chip" href="/block/' + (hh - 1) + '">← #' + fmt(hh - 1) + '</a><a class="chip" href="/block/' + (hh + 1) + '">#' + fmt(hh + 1) + ' →</a><a class="chip" href="https://mempool.space/block/' + hh + '" target="_blank" rel="noopener">mempool.space ↗</a></div>';
    if (!b) { return h + '<p class="lede">This block has not been scanned by the explorer yet.</p>'; }
    h += '<p class="lede">Mined ' + esc(new Date(b.time * 1000).toUTCString().replace(' GMT', ' UTC')) + ' · ' + fmt(b.tx_count) + ' transactions · ' + fmt(b.opreturn_count) + ' OP_RETURN outputs</p>';
    var text = 0, tok = 0; (s.feed || []).forEach(function (m) { if (!isProto(m)) text++; else if (isTokenProto(m.protocol)) tok++; });
    var tot = b.opreturn_count || 1; var parts = [['Runes', b.runes_count, 'var(--chip)'], ['Opaque', b.binary_count, 'var(--line)'], ['Protocols', Math.max(0, b.stored_count - text - tok), 'var(--fg3)'], ['Tokens', tok, 'var(--tok)'], ['Human messages', text, 'var(--sig)']];
    h += '<div class="sgroup"><span class="slabel">WHAT THE ' + fmt(b.opreturn_count) + ' OUTPUTS CARRIED</span><div class="compbar">';
    parts.forEach(function (p) { if (p[1] > 0) h += '<i style="width:' + Math.max(0.5, p[1] / tot * 100) + '%;background:' + p[2] + '" title="' + attr(p[0] + ' ' + fmt(p[1])) + '"></i>'; });
    h += '</div><div class="legend">'; parts.forEach(function (p) { h += '<span><i style="background:' + p[2] + '"></i>' + esc(p[0]) + ' ' + fmt(p[1]) + (p[0] === 'Runes' ? ' (counted only)' : '') + '</span>'; }); h += '</div></div>';
    return h;
  }
  function railHTML(s) {
    var ch = s.chain;
    var h = '<aside class="rail">';
    if (ch && ch.blocks) {
      var pct = ch.opreturn_outputs ? Math.round(ch.runes_outputs / ch.opreturn_outputs * 100) : 0;
      h += '<div class="grp"><span class="slabel">CHAIN CENSUS</span><div class="census">';
      h += '<div><span class="v">' + fmt(ch.blocks) + '</span><span class="l">Blocks scanned</span></div>';
      h += '<div><span class="v">' + (ch.opreturn_outputs >= 1e6 ? (ch.opreturn_outputs / 1e6).toFixed(2) + 'M' : fmt(ch.opreturn_outputs)) + '</span><span class="l">OP_RETURN outputs</span></div>';
      h += '<div><span class="v">' + pct + '%</span><span class="l">Runes, counted only</span></div>';
      h += '<div><span class="v">' + (s.protocols || []).length + '</span><span class="l">Protocols decoded</span></div>';
      h += '</div></div>';
      if (ch.recent && ch.recent.length) {
        h += '<div class="grp" style="gap:6px"><span class="slabel" style="margin-bottom:4px">LATEST BLOCKS</span>';
        ch.recent.slice(0, 6).forEach(function (b) { h += '<a class="blk" href="/block/' + b.height + '"><b>#' + fmt(b.height) + '</b><span>' + esc(timeAgo(b.time, s.now)) + '</span><span style="color:var(--fg2)">' + (b.stored_count ? b.stored_count + ' msg' + (b.stored_count > 1 ? 's' : '') : '—') + '</span></a>'; });
        h += '</div>';
      }
    }
    var cats = s.categories || [];
    if (cats.length) {
      var tot = cats.reduce(function (t, c) { return t + (c.count || 0); }, 0) || 1;
      h += '<div class="grp" style="gap:10px"><span class="slabel">WHAT THEY’RE SAYING</span>';
      cats.slice(0, 6).forEach(function (c) { var p = Math.round(c.count / tot * 100); h += '<a class="mix" href="/cat/' + encodeURIComponent(catSlug(c.category)) + '"><div class="t"><span>' + esc(c.category) + '</span><span>' + p + '%</span></div><div class="bar"><i class="' + (HOSTILE[c.category] ? 'sig' : '') + '" style="width:' + p + '%"></i></div></a>'; });
      h += '</div>';
    }
    h += '<button class="sugcard" data-action="suggest-open" data-col="' + (s.filter || '') + '"><b>Know an address collecting messages?</b><span>SUGGEST IT →</span></button>';
    h += '</aside>';
    return h;
  }

  /* ---- the whole feed screen ---- */
  function feedHTML(s) {
    var wide = !s.protocol && !s.tick && !s.block;
    var h = '<div class="feed-grid' + (wide ? ' wide' : '') + '"><main class="page">';
    h += '<div class="phead"><div class="tt"><span class="kicker">' + esc(feedKicker(s)) + '</span><h2 class="title page-title">' + esc(feedTitle(s)) + '</h2>' + (s.protocol ? '<p class="lede">' + esc(protoBlurb(s.protocol)) + '</p>' : '') + '</div>';
    h += '<div class="sorttabs"><a href="' + attr(sortHref(s, 'hot')) + '" class="' + (s.sort === 'hot' ? 'active' : '') + '">Hottest</a><a href="' + attr(sortHref(s, 'new')) + '" class="' + (s.sort === 'new' ? 'active' : '') + '">Newest</a></div></div>';
    if (s.protocol) h += protocolHeadHTML(s);
    if (s.tick) h += tickHeadHTML(s);
    if (s.block) h += blockHeadHTML(s);
    if (s.filter || s.address) { var c = colById(s, s.filter); h += '<div class="pills"><a class="chip active" href="' + attr(s.address ? '/a/' + encodeURIComponent(s.address) + '/chat' : '/c/' + colSlug(c) + '/chat') + '">💬 Open chat room</a>' + (c && c.description ? '<span class="caption" style="flex:1;min-width:200px">' + esc(c.description) + '</span>' : '') + '</div>'; }
    var pills = feedFilters(s);
    if (pills.length) { h += '<div class="pills">'; pills.forEach(function (p) { h += '<a class="pill" href="' + attr(p.href) + '">' + esc(p.label) + ' <span class="x">✕</span></a>'; }); h += '<a class="clearall" href="/feed">CLEAR ALL</a>' + (s.q ? '<span class="caption">search runs within the loaded messages</span>' : '') + '</div>'; }
    if (s.newBlock && s.newBlock.rows.length) { h += '<button class="newbar" data-action="reveal-new"><span class="l"><span class="d"></span>Block #' + fmt(s.newBlock.height) + ' added ' + s.newBlock.rows.length + ' new message' + (s.newBlock.rows.length > 1 ? 's' : '') + '</span><span class="r">SHOW ↑</span></button>'; }
    var list = visibleFeed(s);
    h += '<div class="list" id="feed-list">';
    if (!list.length) h += '<div class="empty">' + (s.feedError ? esc(s.feedError) + ' — retry in a moment.' : (s.q ? 'No loaded messages match “' + esc(s.q) + '”.' : 'No messages match these filters.')) + '</div>';
    list.forEach(function (m) { h += rowHTML(s, m); });
    h += '</div>';
    // A real link, so crawlers can walk the whole feed; the client intercepts it to append in place.
    if (s.nextBefore) h += '<a class="btn-more" href="' + attr(nextHref(s)) + '" data-action="more">Load more ↓</a>';
    h += '<div class="status" id="status"></div>';
    if (s.protocol) h += protocolTailHTML(s);
    if (s.extraHtml) h += s.extraHtml;
    h += '</main>';
    if (wide) h += railHTML(s);
    h += '</div>';
    return h;
  }

  /* ---- message detail ---- */
  function clock(ts) { return new Date(ts * 1000).toISOString().slice(11, 16) + ' UTC'; }
  function dateOf(ts) { return new Date(ts * 1000).toISOString().slice(0, 10); }
  function fmtSats(n) { if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M'; if (n >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K'; return fmt(n); }
  function byteSize(text) { try { return new TextEncoder().encode(text || '').length + ' bytes'; } catch (e) { return String(text || '').length + ' chars'; } }
  function factRow(k, v, copyable) { return '<div class="f"><span class="k">' + esc(k) + '</span><span class="v">' + (copyable ? '<button data-action="copy" data-copy="' + attr(v) + '" title="copy">' + esc(v) + '</button>' : v) + '</span></div>'; }
  /** Envelope UI shared by the detail card and chat bubbles; `armorPrefix` keeps the two id namespaces apart. */
  function envelopeHTML(m, env, armorPrefix, sub) {
    var h = '';
    if (env.type === 'bie1') {
      h += '<div class="crypto-envelope bie1" id="env-' + attr(m.txid) + '"><div class="env-head"><span class="env-icon">⚡</span><div class="env-info"><div class="env-title">Electrum BIE1 ECIES Encrypted</div><div class="env-sub">Recipient: <code>' + esc(sub) + '</code> (secp256k1)</div></div></div>';
      h += '<div class="env-actions"><button class="env-btn decrypt-btn" data-action="open-decrypt" data-txid="' + attr(m.txid) + '" data-payload="' + attr(env.bie1Payload) + '" data-addr="' + attr(m.address) + '">🔑 Decrypt with Private Key</button><button class="env-btn" data-action="copy" data-copy="' + attr(env.bie1Payload) + '">📋 Copy Payload</button><button class="env-btn" data-action="toggle-armor" data-target="' + armorPrefix + attr(m.txid) + '">🔍 Raw Payload</button></div>';
      h += '<div class="env-decrypted" id="dec-' + attr(m.txid) + '" style="display:none"></div><div class="env-armor" id="' + armorPrefix + attr(m.txid) + '" style="display:none"><pre><code>' + esc(env.bie1Payload) + '</code></pre></div></div>';
    } else if (env.type === 'pgp-encrypted') {
      h += '<div class="crypto-envelope pgp" id="env-' + attr(m.txid) + '"><div class="env-head"><span class="env-icon">🔒</span><div class="env-info"><div class="env-title">Encrypted for Blockstream Security</div><div class="env-sub">RSA-4096 Subkey: <code>BB332D31CBA44EDF</code></div></div></div>';
      h += '<div class="env-actions"><button class="env-btn" data-action="toggle-armor" data-target="' + armorPrefix + attr(m.txid) + '">🔍 Inspect PGP Armor</button><button class="env-btn" data-action="copy" data-copy="' + attr(env.pgpArmor || m.content) + '">📋 Copy PGP</button><a class="env-btn" href="https://blockstream.com/pgp.txt" target="_blank" rel="noopener">🔑 Public Key ↗</a></div>';
      h += '<div class="env-armor" id="' + armorPrefix + attr(m.txid) + '" style="display:none"><pre><code>' + esc(env.pgpArmor || m.content) + '</code></pre></div></div>';
    } else if (env.type === 'pgp-signed' && env.pgpArmor) {
      h += '<div class="env-armor-toggle"><button class="env-text-btn" data-action="toggle-armor" data-target="' + armorPrefix + attr(m.txid) + '">🔍 Inspect raw PGP signature</button><div class="env-armor" id="' + armorPrefix + attr(m.txid) + '" style="display:none"><pre><code>' + esc(env.pgpArmor) + '</code></pre></div></div>';
    }
    return h;
  }
  function signedBadgeHTML(env, keyLabel) { return '<div class="crypto-sig-badge"><span class="sig-icon">🛡️</span><span>Signed by <strong>' + esc(env.signer || 'Blockstream Security') + '</strong></span><span>' + keyLabel + ' <code>' + esc(env.signerKey || '4AC8CC886844A2D6') + '</code></span><a href="https://blockstream.com/pgp.txt" target="_blank" rel="noopener">pgp.txt ↗</a></div>'; }
  function detailHTML(s) {
    var m = s.detail;
    var proto = isProto(m); var hostile = HOSTILE[m.category]; var env = parseCryptoEnvelope(m.content); var media = splitMedia(m.content);
    var col = m.collection_id ? colById(s, m.collection_id) : null;
    var qtext = displayText(m); var qlen = qtext.length; var qcls = proto ? 'proto' : (qlen > 600 ? 'long' : (qlen > 240 ? 'med' : ''));
    var h = '<main class="page"><button class="back" data-action="back">← Back to feed</button><div class="dgrid"><div class="dmain">';
    h += '<div class="artifact"><div class="meta"><span class="dot ' + (proto ? 'tok' : catDot(m.category)) + '"></span>';
    h += proto ? '<a class="catl tok" href="/p/' + encodeURIComponent(m.protocol) + '">' + esc(protoLabel(m.protocol)) + '</a>' : (m.category ? '<a class="catl' + (hostile ? ' sig' : '') + '" href="/cat/' + encodeURIComponent(catSlug(m.category)) + '">' + esc(m.category) + '</a>' : '<span class="catl">Unclassified</span>');
    h += envBadges(m);
    h += '<span class="st ' + (m.is_mempool ? 'mem' : 'conf') + '">' + (m.is_mempool ? '◷ IN MEMPOOL' : '✓ CONFIRMED') + '</span></div>';
    if (env && env.isSigned) h += signedBadgeHTML(env, 'Key ID:');
    if (proto) h += opLine(m);
    h += '<blockquote class="' + qcls + '">' + esc(qtext) + '</blockquote>';
    h += mediaHTML(media);
    if (env) h += envelopeHTML(m, env, 'armor-det-', m.address);
    if (m.ops && m.ops.length) {
      h += '<div class="ops"><span class="slabel" style="padding:12px 0 4px">DECODED OP_RETURN OUTPUTS · ' + m.ops.length + '</span>';
      m.ops.forEach(function (o) { h += '<div class="op"><span>vout ' + (o.vout < 0 ? '?' : o.vout) + '</span><a class="pl' + (isTokenProto(o.protocol) ? ' tok' : '') + '" href="/p/' + encodeURIComponent(o.protocol) + '">' + esc(protoLabel(o.protocol)) + '</a>' + (o.op ? '<span>' + esc(o.op) + '</span>' : '') + (o.amount ? '<code>' + esc(fmtAmt(o.amount)) + '</code>' : '') + (o.tick ? '<a href="/tick/' + encodeURIComponent(o.tick) + '" style="color:var(--tok);font-weight:600">$' + esc(o.tick) + '</a>' : '') + (o.payload_hex ? '<span class="hex">' + esc(o.payload_hex.length > 200 ? o.payload_hex.slice(0, 200) + '…' : o.payload_hex) + '</span>' : '') + '</div>'; });
      h += '</div>';
    }
    h += '<div class="acts">' + voteGroup(s, m, true);
    h += '<a class="act" href="' + attr(col ? '/c/' + colSlug(col) + '/chat' : '/a/' + encodeURIComponent(m.address) + '/chat') + '">Open in chat room</a>';
    h += '<button class="share" data-action="share">Share card</button></div></div>';
    var related = s.related || [];
    if (related.length) {
      h += '<div class="more"><span class="slabel">MORE FROM ' + esc((col ? shortCol(col) : shortAddr(m.address)).toUpperCase()) + '</span>';
      related.forEach(function (r) { h += '<a href="/m/' + attr(r.txid) + '"><span>' + esc(displayText(r).replace(/\n+/g, ' / ')) + '</span><span>' + esc(timeAgo(msgTime(r), s.now)) + '</span></a>'; });
      h += '</div>';
    }
    h += '<p class="caption">Etched into the Bitcoin blockchain. It cannot be deleted, edited, or taken down.</p>';
    h += '</div>';
    h += '<div class="facts"><span class="h">ON-CHAIN RECORD</span>';
    h += factRow('TXID', m.txid, true);
    h += factRow('BLOCK', m.block_height != null ? '<a href="/block/' + m.block_height + '">#' + fmt(m.block_height) + '</a>' + (m.block_time != null ? ' · ' + dateOf(m.block_time) : '') : (m.is_mempool ? 'unconfirmed (in mempool)' : '—'));
    h += factRow('FEE', (feeText(m) || '—') + (m.fee_sats != null ? ' · ' + fmtSats(m.fee_sats) + ' sats <span id="feeusd" style="display:block;line-height:1.45em;min-height:1.45em;color:var(--fg4)">' + esc(s.feeUsd || '') + '</span>' : ''));
    h += factRow('ADDRESS', m.address, true);
    if (m.sender && m.sender !== m.address) h += factRow('SENDER', m.sender, true);
    if (m.recipient && m.recipient !== m.address) h += factRow('RECIPIENT', m.recipient, true);
    h += factRow('COLLECTION', col ? '<a href="/c/' + attr(colSlug(col)) + '">' + esc(col.name) + '</a>' : '—');
    h += factRow('PROTOCOL', proto ? '<a href="/p/' + encodeURIComponent(m.protocol) + '">' + esc(m.protocol) + '</a>' : 'text');
    h += factRow('CATEGORY', proto ? '—' : (m.category ? '<a href="/cat/' + encodeURIComponent(catSlug(m.category)) + '">' + esc(m.category) + '</a> (AI)' : 'unclassified'));
    h += factRow('SIZE', byteSize(m.content));
    h += factRow('TIME', esc(timeAgo(msgTime(m), s.now)) + (m.block_time != null ? ' · ' + clock(m.block_time) : ''));
    h += '<a class="ext" href="https://mempool.space/tx/' + attr(m.txid) + '" target="_blank" rel="noopener">VIEW ON MEMPOOL.SPACE ↗</a></div>';
    h += '</div></main>';
    return h;
  }

  /* ---- chat rooms ---- */
  var AVCOL = ['#d9481f', '#b5851f', '#5b7a4a', '#3d6e8f', '#7a4f9e', '#a03c5c', '#2f8a7d', '#6b5b3e'];
  function hashStr(str) { var h = 7; str = String(str || ''); for (var i = 0; i < str.length; i++) { h = ((h * 31) + str.charCodeAt(i)) >>> 0; } return h; }
  function avatarColor(a) { return AVCOL[hashStr(a) % AVCOL.length]; }
  function partyOf(s, addr) { var ps = (s.chat && s.chat.participants) || []; for (var i = 0; i < ps.length; i++) { if (ps[i].address === addr) return ps[i]; } return null; }
  function shortLabel(l) { return String(l || '').split(' (')[0]; }
  function partyName(p, addr) { return p && p.label ? shortLabel(p.label) : shortAddr(addr); }
  function bubbleHTML(s, m, first, multi) {
    var sender = m.sender || ''; var party = sender ? partyOf(s, sender) : null;
    var name = sender ? partyName(party, sender) : 'unknown sender';
    var color = party ? 'var(--sig)' : avatarColor(sender || m.txid);
    var env = parseCryptoEnvelope(m.content); var bodyHTML = '';
    if (env) {
      if (env.isSigned) bodyHTML += signedBadgeHTML(env, 'Key:');
      if (env.leadText) { var ltext = env.leadText; var llong = ltext.length > 520; if (llong) ltext = ltext.slice(0, 480) + '…'; bodyHTML += '<a class="bubble-text" href="/m/' + attr(m.txid) + '">' + esc(ltext) + (llong ? '<span class="readmore">read full message →</span>' : '') + '</a>'; }
      bodyHTML += envelopeHTML(m, env, 'armor-', shortAddr(m.address));
    } else {
      var text = displayText(m); var long = text.length > 520; if (long) text = text.slice(0, 480) + '…';
      bodyHTML = '<a class="bubble-text" href="/m/' + attr(m.txid) + '">' + esc(text) + (long ? '<span class="readmore">read full message →</span>' : '') + '</a>' + mediaHTML(splitMedia(m.content));
    }
    var h = '<div class="turn' + (party ? ' party' : '') + '">';
    if (first) { h += '<div class="who-line" style="color:' + color + '"><span>' + esc(name) + '</span>'; if (multi && m.address !== sender) h += '<span class="to">→ ' + esc(partyName(partyOf(s, m.address), m.address)) + '</span>'; h += '</div>'; }
    h += '<div class="bubble' + (m.is_mempool ? ' mem' : '') + '">' + bodyHTML + '</div>';
    h += '<div class="bubble-meta">' + voteGroup(s, m, false);
    if (m.category) h += '<span class="cat' + (HOSTILE[m.category] ? ' sig' : '') + '">' + esc(m.category) + '</span>';
    if (m.is_mempool) h += '<span class="st mem">◷ in mempool</span>';
    if (m.dup_count > 1) h += '<span title="Same message broadcast in ' + m.dup_count + ' separate transactions">×' + m.dup_count + ' txs</span>';
    h += '<span>' + esc(clock(tsOf(m))) + '</span></div></div>';
    return h;
  }
  function chatHTML(s) {
    var chat = s.chat || { messages: [], participants: [], nextBefore: null };
    var col = s.filter ? colById(s, s.filter) : null;
    var title = s.address ? s.address : (col ? col.name : 'Chat rooms');
    var h = '<main class="page narrow"><div class="tt"><span class="kicker">CHAT ROOM · OLDEST TO NEWEST</span><h2 class="title page-title">' + esc(title) + '</h2></div>';
    h += '<div class="chips">'; (s.collections || []).forEach(function (c) { h += '<a class="chip' + (s.filter === c.id ? ' active' : '') + '" href="/c/' + attr(colSlug(c)) + '/chat">' + esc(shortCol(c)) + '</a>'; }); h += '</div>';
    var msgs = chat.messages || [];
    if (msgs.some(function (m) { return parseCryptoEnvelope(m.content); })) {
      h += '<div class="keb" id="keb"><button class="keb-head" data-action="keb-toggle"><span>🔐</span><span>CRYPTOGRAPHIC KEY EXCHANGE ACTIVE</span><span class="keb-badge">On-Chain PGP / ECIES</span><span style="margin-left:8px">▾</span></button><div class="keb-body">';
      h += '<div class="keb-party"><div class="keb-role">RESPONDER / PROTOCOL DEFENSE</div><div class="keb-name">Blockstream Security Reporting</div><div class="keb-key"><span>PGP Signing Key: <code>4AC8CC886844A2D6</code></span><span>Encryption Subkey: <code>BB332D31CBA44EDF</code> (RSA-4096)</span></div><div class="keb-fp">Fingerprint: <code>1176 542D A98E 71E1 3372 2EF7 4AC8 CC88 6844 A2D6</code></div><div class="keb-links"><a href="https://blockstream.com/pgp.txt" target="_blank" rel="noopener">Download pgp.txt ↗</a><a href="https://keyserver.ubuntu.com/pks/lookup?search=0x1176542DA98E71E133722EF74AC8CC886844A2D6&fingerprint=on&op=index" target="_blank" rel="noopener">Ubuntu Keyserver ↗</a></div></div>';
      h += '<div class="keb-divider">⇄</div>';
      h += '<div class="keb-party"><div class="keb-role">CALLER / WHITEHAT HOLDING</div><div class="keb-name">Peg-Out Auditor Address</div><div class="keb-key"><span>Bitcoin Address: <code>bc1ql4mfu...jlte</code></span><span>Scheme: <strong>Electrum BIE1 ECIES</strong> (secp256k1)</span></div><div class="keb-desc">Blockstream encrypts payloads to the whitehat using Bitcoin secp256k1 ECDH + AES-128-CBC + HMAC-SHA256. The whitehat replies using Blockstream’s RSA-4096 PGP subkey.</div><div class="keb-links"><a href="/a/bc1ql4mfu6aundtkksxklfajs2h3t9nzcd6gyqjlte/chat">Filter Whitehat Chat ↗</a></div></div>';
      h += '</div></div>';
    }
    var parts = chat.participants || []; var multi = parts.length > 1;
    h += '<div class="room" id="room-log" data-scroll="bottom">';
    if (chat.nextBefore) h += '<button class="btn-more" data-action="chat-earlier">↑ Load earlier</button>';
    if (!msgs.length) h += '<span class="empty" style="padding:30px 0">No messages in this room yet.</span>';
    var lastDay = '', lastSender = null, lastTs = 0;
    msgs.forEach(function (m) { var ts = tsOf(m); var day = dateOf(ts); if (day !== lastDay) { h += '<div class="day">' + day + '</div>'; lastDay = day; lastSender = null; } var sender = m.sender || ''; var first = sender !== lastSender || ts - lastTs > 600; h += bubbleHTML(s, m, first, multi); lastSender = sender; lastTs = ts; });
    h += '</div>';
    h += '<div class="roomfoot"><span>New replies land with each block · <button class="clearall" data-action="share-room" style="padding:0">SHARE ROOM ↗</button></span><a class="etch" href="/guide">ETCH A REPLY →</a></div>';
    h += '<p class="caption">Every bubble is an OP_RETURN output etched into Bitcoin. Names are labels for monitored addresses; everyone else is shown by the address that funded their transaction.</p></main>';
    return h;
  }

  /* ---- about & contact (landing page and llms.txt share these strings) ---- */
  var CONTACT = {
    handle: '@xbtoshi',
    url: 'https://x.com/xbtoshi',
    repo: 'https://github.com/xbtoshi/opreturn-monitor',
    who: 'The Permanent Record is built and run by @xbtoshi. It reads public Bitcoin data from open nodes, decodes every OP_RETURN output, and labels human-readable messages with an AI classifier; the labels are a reading aid, not a judgement, and nothing here is financial advice.',
    how: 'Corrections, questions about a monitored address, press, or anything else: send a direct message on X. Bugs and ideas are welcome as issues on GitHub, where the whole site is open source. Know an address that is collecting messages? Suggest it and a human reviews it before it is monitored.'
  };
  // The links are placed by replacing one phrase each in the escaped copy; keep every phrase unique in CONTACT.
  function contactHTML() {
    var h = '<div class="about-sec" id="contact"><span class="kicker">\u25c6 ABOUT &amp; CONTACT</span>';
    h += '<p class="lede">' + esc(CONTACT.who).replace(esc(CONTACT.handle), '<a href="' + attr(CONTACT.url) + '" rel="me noopener" target="_blank">' + esc(CONTACT.handle) + '</a>') + '</p>';
    h += '<p class="lede">' + esc(CONTACT.how).replace('direct message on X', '<a href="' + attr(CONTACT.url) + '" rel="me noopener" target="_blank">direct message on X</a>').replace('issues on GitHub', '<a href="' + attr(CONTACT.repo) + '/issues" rel="noopener" target="_blank">issues on GitHub</a>') + '</p>';
    h += '<div class="cta"><a class="btn" href="' + attr(CONTACT.url) + '" rel="me noopener" target="_blank">' + esc(CONTACT.handle) + ' on X \u2197</a><a class="btn" href="' + attr(CONTACT.repo) + '" rel="noopener" target="_blank">Source on GitHub \u2197</a><button class="btn" type="button" data-action="suggest-open" data-col="">+ Suggest an address</button></div>';
    h += '</div>';
    return h;
  }

  return {
    CONTACT: CONTACT, contactHTML: contactHTML,
    HOSTILE: HOSTILE, PROTO_LABEL: PROTO_LABEL, PROTO_BLURB: PROTO_BLURB,
    esc: esc, attr: attr, fmt: fmt, shortAddr: shortAddr, catCode: catCode, timeAgo: timeAgo, msgTime: msgTime, tsOf: tsOf, feeText: feeText, whenText: whenText,
    shortCol: shortCol, colSlug: colSlug, catSlug: catSlug, catDot: catDot, protoLabel: protoLabel, protoBlurb: protoBlurb, isTokenProto: isTokenProto, isProto: isProto,
    fmtAmt: fmtAmt, primaryOp: primaryOp, splitMedia: splitMedia, mediaHTML: mediaHTML, parseCryptoEnvelope: parseCryptoEnvelope, displayText: displayText, opLine: opLine, envBadges: envBadges,
    colById: colById, colName: colName, colBySlug: colBySlug, colIndex: colIndex, catName: catName, voteGroup: voteGroup,
    routeName: routeName, defaultSort: defaultSort, validCursor: validCursor, feedParams: feedParams, feedQuery: feedQuery, sortHref: sortHref, kindHref: kindHref, nextHref: nextHref, withKind: withKind,
    feedFilters: feedFilters, visibleFeed: visibleFeed, feedTitle: feedTitle, feedKicker: feedKicker, filtersHTML: filtersHTML, mobileCtlHTML: mobileCtlHTML,
    rowHTML: rowHTML, protocolHeadHTML: protocolHeadHTML, protocolTailHTML: protocolTailHTML, tickHeadHTML: tickHeadHTML, blockHeadHTML: blockHeadHTML, railHTML: railHTML, feedHTML: feedHTML,
    clock: clock, dateOf: dateOf, fmtSats: fmtSats, factRow: factRow, detailHTML: detailHTML,
    avatarColor: avatarColor, partyOf: partyOf, partyName: partyName, shortLabel: shortLabel, bubbleHTML: bubbleHTML, chatHTML: chatHTML
  };
})();
export default FV;
