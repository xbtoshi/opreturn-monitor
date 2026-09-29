import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import FV, { type FeedView } from '../src/feedview.js';

const NOW = 1_700_000_600_000;
const base: FeedView = {
  pathname: '/feed',
  search: '',
  sort: 'new',
  kind: 'text',
  q: '',
  feed: [],
  collections: [
    { id: 1, name: 'Coldcard Exploit Bulletin Board', slug: 'coldcard-exploit-bulletin-board', description: 'Attackers consolidating swept coins.', message_count: 59 },
    { id: 2, name: 'Genesis & Satoshi Tribute', slug: 'genesis-satoshi-tribute', message_count: 694 },
  ],
  categories: [
    { category: 'Other', count: 30 },
    { category: 'Threats / Hostility', count: 10 },
  ],
  protocols: [{ protocol: 'ico-20', count: 500 }, { protocol: 'omni', count: 200 }],
  ticks: [{ tick: 'LEAF', protocol: 'ico-20', count: 400 }],
  chain: { blocks: 1490, opreturn_outputs: 4_400_389, runes_outputs: 4_141_826, highest_height: 969_179, stored_txs: 93_519, recent: [{ height: 969_179, time: 1_700_000_000, stored_count: 3 }] },
  now: NOW,
};
const text = { id: 11, txid: 'a'.repeat(64), address: 'bc1qmonitored000000000000000', content: 'Hello, Blockchain!', category: 'Graffiti / Greetings', protocol: 'text', likes: 3, dup_count: 1, is_mempool: 0, block_height: 969_100, block_time: 1_700_000_000, fee_rate: 12, collection_id: 1 };
const proto = { id: 12, txid: 'b'.repeat(64), address: 'bc1qtoken', content: '{"p":"ico-20","op":"transfer","tick":"LEAF","amt":"1630000"}', category: null, protocol: 'ico-20', ops: [{ vout: 0, protocol: 'ico-20', op: 'transfer', tick: 'LEAF', amount: '1630000' }], likes: 0, dup_count: 4, is_mempool: 0, block_height: 969_101, block_time: 1_700_000_100, fee_rate: null, collection_id: null, recipient: 'bc1qrecipient00000000000000' };
const mem = { id: 13, txid: 'c'.repeat(64), address: 'bc1qmem', content: 'x'.repeat(500), category: null, protocol: 'text', likes: 0, is_mempool: 1, created_at: '2023-11-14 22:11:40', block_height: null, block_time: null };
const signed = { id: 14, txid: 'd'.repeat(64), address: 'bc1qsig', content: '-----BEGIN PGP SIGNED MESSAGE-----\nHash: SHA512\n\nYes, thank you.\n-----BEGIN PGP SIGNATURE-----\nabc\n-----END PGP SIGNATURE-----', category: 'Contact / Negotiation', protocol: 'text', likes: 1, block_height: 969_102, block_time: 1_700_000_200 };
const image = { id: 15, txid: 'e'.repeat(64), address: 'bc1qimg', content: 'gm\ndata:image/png;base64,iVBORw0KGgo=', category: 'Graffiti / Greetings', protocol: 'text', likes: 0, block_height: 969_103, block_time: 1_700_000_300 };

const view = (o: Partial<FeedView>): FeedView => ({ ...base, ...o });

describe('feedview: request parity', () => {
  it('derives sort and kind defaults per route like the client', () => {
    expect(FV.defaultSort('c')).toBe('hot');
    expect(FV.defaultSort('cat')).toBe('hot');
    expect(FV.defaultSort('a')).toBe('hot');
    for (const r of ['feed', 'p', 'tick', 'block', 'about']) expect(FV.defaultSort(r), r).toBe('new');
    expect(FV.routeName('/c/coldcard/chat')).toBe('c');
    expect(FV.routeName('/')).toBe('about');
  });
  it('builds sort and kind hrefs exactly, dropping the route default', () => {
    const v = view({ pathname: '/c/coldcard', search: '?kind=all', sort: 'hot', kind: 'all', filter: 1 });
    expect(FV.sortHref(v, 'hot')).toBe('/c/coldcard?kind=all');
    expect(FV.sortHref(v, 'new')).toBe('/c/coldcard?kind=all&sort=new');
    expect(FV.kindHref(v, 'text')).toBe('/c/coldcard');
    const p = view({ pathname: '/p/ico-20', search: '', sort: 'new', kind: 'all', protocol: 'ico-20' });
    expect(FV.kindHref(p, 'text')).toBe('/feed');
    expect(FV.sortHref(p, 'hot')).toBe('/p/ico-20?sort=hot');
    expect(FV.feedQuery(view({ filter: 1, sort: 'hot', kind: 'all' }), 50, 'cur sor')).toBe('/api/messages?sort=hot&limit=50&collection_id=1&kind=all&before=cur%20sor');
    expect(FV.feedQuery(view({ category: 'Threats / Hostility' }))).toBe('/api/messages?sort=new&limit=50&category=threats-hostility');
  });
  it('filters the visible feed by the search box on both sides', () => {
    const v = view({ feed: [text, proto], q: 'hello' });
    expect(FV.visibleFeed(v).map((m) => m.id)).toEqual([11]);
    expect(FV.visibleFeed(view({ feed: [text, proto] })).length).toBe(2);
  });
});

describe('feedview: rows', () => {
  it('renders a text row with the shared contract', () => {
    const h = FV.rowHTML(base, text);
    const order = ['<article class="row" data-id="11">', '<div class="meta">', 'class="dot "', 'class="cat" href="/cat/graffiti-greetings"', 'class="sep"', 'class="col" href="/c/coldcard-exploit-bulletin-board"', '>Coldcard Exploit<', 'class="when">10m ago', '<h3 class="content"><a href="/m/' + 'a'.repeat(64) + '">Hello, Blockchain!</a></h3>', '<div class="foot"><span class="vg">', 'data-action="vote" data-dir="up" data-id="11"', 'class="score" data-lc="11">3<', 'class="chain"><a href="/block/969100">#969,100</a>', '12 sat/vB', '<a class="open" href="/m/' + 'a'.repeat(64) + '">Open'];
    let pos = -1;
    for (const needle of order) { const i = h.indexOf(needle, pos + 1); expect(i, needle).toBeGreaterThan(pos); pos = i; }
    expect(h).not.toContain('data-action="open-msg"');
  });
  it('renders protocol, duplicate, mempool, signed and image rows', () => {
    const p = FV.rowHTML(base, proto);
    expect(p).toContain('class="cat tok" href="/p/ico-20">ico-20<'.replace('ico-20<', 'ICO-20<'));
    expect(p).toContain('<div class="opline"><span>transfer</span><span class="amt">1,630,000</span><a class="tk" href="/tick/LEAF">$LEAF</a><span class="arrow">');
    expect(p).toContain('title="Same message broadcast in 4 transactions">×4</span>');
    expect(p).toContain('<h3 class="content proto">');
    const m = FV.rowHTML(base, mem);
    expect(m).toContain('class="when mem">◷ mempool · ');
    expect(m).toContain('unconfirmed');
    expect(m).toContain('<span class="readmore">');
    const s = FV.rowHTML(base, signed);
    expect(s).toContain('PGP SIGNED</span>');
    expect(s).toContain('>Yes, thank you.</a></h3>');
    const i = FV.rowHTML(base, image);
    expect(i).toContain('<div class="inline-media"><img src="data:image/png;base64,iVBORw0KGgo="');
    expect(i).toContain('>gm</a></h3>');
    expect(FV.rowHTML(base, { ...text, content: '<script>alert(1)</script>' })).not.toContain('<script>');
  });
  it('marks votes from the view and tolerates a view without vote maps', () => {
    expect(FV.voteGroup(view({ voted: { 11: 'down' } }), text, false)).toContain('class="down voted"');
    expect(FV.voteGroup(view({ liked: { 11: true } }), text, true)).toContain('class="up voted"');
    expect(FV.voteGroup(view({ voted: undefined, liked: undefined }), text, false)).toContain('class="score"');
  });
});

describe('feedview: page', () => {
  it('builds the feed screen skeleton per route type', () => {
    const feed = FV.feedHTML(view({ feed: [text, proto], nextBefore: 'x' }));
    for (const n of ['<div class="feed-grid wide"><main class="page">', 'class="kicker">HUMAN MESSAGES · ALL COLLECTIONS<', 'page-title">All transmissions<', 'class="sorttabs"', '<div class="list" id="feed-list">', 'data-id="11"', 'data-id="12"', '<button class="btn-more" data-action="more">', '<div class="status" id="status"></div>', '</main><aside class="rail">', 'CHAIN CENSUS', '1,490', 'LATEST BLOCKS', 'WHAT THEY’RE SAYING', 'data-action="suggest-open"']) expect(feed, n).toContain(n);
    const col = FV.feedHTML(view({ pathname: '/c/coldcard-exploit-bulletin-board', sort: 'hot', filter: 1, feed: [text], extraHtml: '<section data-ssr-extra>cards</section>' }));
    expect(col).toContain('class="kicker">HUMAN MESSAGES · COL-01<');
    expect(col).toContain('page-title">Coldcard Exploit Bulletin Board<');
    expect(col).toContain('href="/c/coldcard-exploit-bulletin-board/chat">💬 Open chat room</a><span class="caption"');
    expect(col).toContain('class="pill" href="/feed">Coldcard Exploit');
    expect(col.indexOf('<section data-ssr-extra>cards</section></main>')).toBeGreaterThan(col.indexOf('id="status"'));
    const p = FV.feedHTML(view({ pathname: '/p/ico-20', kind: 'all', protocol: 'ico-20', feed: [proto] }));
    expect(p).toContain('<div class="feed-grid"><main class="page">');
    expect(p).not.toContain('<aside class="rail">');
    expect(p).toContain('TOKEN PROTOCOL · ICO-20');
    expect(p).toContain('TICKERS ON ICO-20');
    expect(p).toContain('RAW EXAMPLE');
    const b = FV.feedHTML(view({ pathname: '/block/969101', kind: 'all', block: 969_101, blockRow: { height: 969_101, time: 1_700_000_000, tx_count: 4000, opreturn_count: 3000, runes_count: 2900, binary_count: 10, stored_count: 60 }, feed: [proto] }));
    expect(b).toContain('BLOCK CENSUS');
    expect(b).toContain('href="/block/969100">← #969,100</a>');
    expect(b).toContain('WHAT THE 3,000 OUTPUTS CARRIED');
    const t = FV.feedHTML(view({ pathname: '/tick/LEAF', kind: 'all', tick: 'LEAF', feed: [proto] }));
    expect(t).toContain('page-title">$LEAF<');
    expect(t).toContain('Operations, all scanned blocks');
    const empty = FV.feedHTML(view({ feed: [], q: 'zzz' }));
    expect(empty).toContain('No loaded messages match “zzz”.');
  });
  it('renders the sidebar filters and the mobile control bar with active states', () => {
    const v = view({ pathname: '/c/coldcard-exploit-bulletin-board', sort: 'hot', filter: 1, feed: [text] });
    const f = FV.filtersHTML(v, false);
    expect(f).toContain('<span class="slabel">SHOW</span>');
    expect(f).toContain('class="srow active" href="/c/coldcard-exploit-bulletin-board" title="Coldcard Exploit Bulletin Board"');
    expect(f).toContain('<span class="nm">All collections</span><span class="n">753</span>');
    expect(f).toContain('class="srow cat" href="/cat/threats-hostility"><span class="dot sig"></span>');
    expect(FV.filtersHTML(view({ collections: undefined, categories: undefined }), false)).toContain('All collections');
    expect(FV.filtersHTML(v, true)).toContain('class="chip active" href="/c/coldcard-exploit-bulletin-board">Coldcard Exploit');
    expect(FV.mobileCtlHTML(v)).toBe('<div class="seg2"><a href="/c/coldcard-exploit-bulletin-board" class="active">Hottest</a><a href="/c/coldcard-exploit-bulletin-board?sort=new" class="">Newest</a></div><button class="fbtn" data-action="sheet-open">Filter · 1</button>');
  });
});

describe('feedview: the inlined client copy is the same code', () => {
  it('renders byte-identical markup from the copy embedded in src/ui.ts', () => {
    const ui = readFileSync(new URL('../src/ui.ts', import.meta.url), 'utf8');
    const start = ui.indexOf('/*__FEEDVIEW_START__*/');
    const end = ui.indexOf('/*__FEEDVIEW_END__*/');
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    expect(ui.indexOf('/*__FEEDVIEW_START__*/', start + 1)).toBe(-1);
    // Undo the assembler's template-literal escaping (the reverse of assemble.py).
    const src = ui.slice(start, end).replace(/\\\$\{/g, '${').replace(/\\`/g, '`').replace(/\\\\/g, '\\');
    const clientFV = new Function(src + '\nreturn FV;')() as typeof FV;
    for (const v of [
      view({ feed: [text, proto, mem, signed, image], nextBefore: 'n' }),
      view({ pathname: '/c/coldcard-exploit-bulletin-board', sort: 'hot', filter: 1, feed: [text], extraHtml: '<section data-ssr-extra>x</section>' }),
      view({ pathname: '/p/ico-20', kind: 'all', protocol: 'ico-20', feed: [proto] }),
      view({ pathname: '/block/969101', kind: 'all', block: 969_101, blockRow: { height: 969_101, time: 1_700_000_000, tx_count: 4000, opreturn_count: 3000, runes_count: 2900, binary_count: 10, stored_count: 60 }, feed: [proto] }),
      view({ pathname: '/tick/LEAF', kind: 'all', tick: 'LEAF', feed: [proto] }),
      view({ pathname: '/cat/other', sort: 'hot', category: 'Other', feed: [text], q: 'hello' }),
      view({ pathname: '/a/bc1qmonitored000000000000000', sort: 'hot', kind: 'all', address: 'bc1qmonitored000000000000000', feed: [text, mem] }),
    ]) {
      expect(clientFV.feedHTML(v)).toBe(FV.feedHTML(v));
      expect(clientFV.filtersHTML(v, false)).toBe(FV.filtersHTML(v, false));
      expect(clientFV.mobileCtlHTML(v)).toBe(FV.mobileCtlHTML(v));
    }
  });
});

describe('feedview: message page and chat rooms', () => {
  const bie1 = { id: 21, txid: 'f'.repeat(64), address: 'bc1ql4mfu6aundtkksxklfajs2h3t9nzcd6gyqjlte', content: 'Encrypted to the key behind bc1ql4mfu6aundtkksxklfajs2h3t9nzcd6gyqjlte QklFMQNYZayNaeJgXiAtazTnKU8X2fMlvFUBF3AzSB', category: 'Contact / Negotiation', protocol: 'text', likes: 4, block_height: 969_050, block_time: 1_700_000_000, fee_sats: 1200, fee_rate: 3, sender: 'bc1qblockstream000000000', collection_id: 1 };
  const pgpEnc = { id: 22, txid: '1'.repeat(64), address: 'bc1qblockstream000000000', content: 'Reply below\n-----BEGIN PGP MESSAGE-----\nabc\n-----END PGP MESSAGE-----', category: null, protocol: 'text', likes: 0, block_height: 969_051, block_time: 1_700_000_700, sender: 'bc1ql4mfu6aundtkksxklfajs2h3t9nzcd6gyqjlte' };
  const withOps = { ...proto, ops: [{ vout: 0, protocol: 'ico-20', op: 'transfer', tick: 'LEAF', amount: '1630000', payload_hex: '7b2270223a2269636f2d3230227d' }], fee_sats: 500 };

  it('renders the detail card with envelope, ops, facts and related links', () => {
    const h = FV.detailHTML(view({ pathname: '/m/' + bie1.txid, detail: bie1, related: [text, proto] }));
    const order = ['<main class="page"><button class="back" data-action="back">', '<div class="dgrid"><div class="dmain">', '<div class="artifact"><div class="meta">', 'class="catl" href="/cat/contact-negotiation"', 'BIE1 ECIES</span>', '<blockquote class="', 'id="env-' + bie1.txid + '"', 'data-action="open-decrypt" data-txid="' + bie1.txid + '" data-payload="QklFMQNYZayNaeJgXiAtazTnKU8X2fMlvFUBF3AzSB" data-addr="' + bie1.address + '"', 'data-action="toggle-armor" data-target="armor-det-' + bie1.txid + '"', 'id="dec-' + bie1.txid + '"', 'id="armor-det-' + bie1.txid + '"', '<div class="acts"><span class="vg big">', 'href="/c/coldcard-exploit-bulletin-board/chat">Open in chat room</a>', 'MORE FROM COLDCARD EXPLOIT', 'href="/m/' + text.txid + '"', '<div class="facts"><span class="h">ON-CHAIN RECORD</span>', 'data-copy="' + bie1.txid + '"', '<a href="/block/969050">#969,050</a> · 2023-11-14', '3 sat/vB · 1,200 sats <span id="feeusd"', '<span class="k">SENDER</span>', 'href="/c/coldcard-exploit-bulletin-board">Coldcard Exploit Bulletin Board</a>', '(AI)', '<span class="k">SIZE</span><span class="v">', 'bytes</span>', '22:13 UTC', 'https://mempool.space/tx/' + bie1.txid];
    let pos = -1;
    for (const needle of order) { const i = h.indexOf(needle, pos + 1); expect(i, needle).toBeGreaterThan(pos); pos = i; }
    const p = FV.detailHTML(view({ pathname: '/m/' + proto.txid, detail: withOps }));
    expect(p).toContain('DECODED OP_RETURN OUTPUTS · 1');
    expect(p).toContain('<div class="op"><span>vout 0</span><a class="pl tok" href="/p/ico-20">ICO-20</a><span>transfer</span><code>1,630,000</code><a href="/tick/LEAF"');
    expect(p).toContain('<span class="hex">7b2270223a2269636f2d3230227d</span>');
    expect(p).toContain('<blockquote class="proto">');
    expect(p).toContain('<span class="k">CATEGORY</span><span class="v">—</span>');
    const e = FV.detailHTML(view({ pathname: '/m/x', detail: pgpEnc }));
    expect(e).toContain('class="crypto-envelope pgp"');
    expect(e).toContain('Inspect PGP Armor');
    expect(e).toContain('>Reply below</blockquote>');
    expect(FV.detailHTML(view({ pathname: '/m/x', detail: { ...text, content: '</script><b>x</b>' } }))).not.toContain('</script>');
  });

  it('renders a chat room with day separators, grouped bubbles, the key-exchange banner and load-earlier', () => {
    const chat = {
      participants: [{ address: 'bc1qblockstream000000000', label: 'Blockstream Security (responder)' }, { address: bie1.address, label: 'Whitehat (peg-out auditor)' }],
      messages: [
        { ...text, id: 31, txid: '3'.repeat(64), sender: 'bc1qanon0000000000000000000', address: 'bc1qblockstream000000000', block_time: 1_700_000_000 },
        { ...text, id: 32, txid: '4'.repeat(64), sender: 'bc1qanon0000000000000000000', address: 'bc1qblockstream000000000', block_time: 1_700_000_100, content: 'second line' },
        { ...bie1, id: 33, txid: '5'.repeat(64), block_time: 1_700_100_000 },
        { ...pgpEnc, id: 34, txid: '6'.repeat(64), block_time: 1_700_100_600, is_mempool: 1 },
      ],
      nextBefore: 'older',
    };
    const h = FV.chatHTML(view({ pathname: '/c/coldcard-exploit-bulletin-board/chat', filter: 1, chat }));
    const order = ['<main class="page narrow">', 'CHAT ROOM · OLDEST TO NEWEST', 'page-title">Coldcard Exploit Bulletin Board<', '<div class="chips"><a class="chip active" href="/c/coldcard-exploit-bulletin-board/chat">', '<div class="keb" id="keb">', '<div class="room" id="room-log" data-scroll="bottom">', '<button class="btn-more" data-action="chat-earlier">', '<div class="day">2023-11-14</div>', '<div class="turn"><div class="who-line" style="color:#', '<span class="to">→ Blockstream Security</span>', '<a class="bubble-text" href="/m/' + '3'.repeat(64) + '">', '<div class="turn"><div class="bubble">', 'second line', '<div class="day">2023-11-16</div>', '<div class="turn party"><div class="who-line" style="color:var(--sig)"><span>Blockstream Security</span><span class="to">\u2192 Whitehat</span>', 'id="env-' + '5'.repeat(64) + '"', 'data-target="armor-' + '5'.repeat(64) + '"', '<div class="bubble mem">', 'class="crypto-envelope pgp"', '<span class="st mem">', '<div class="roomfoot">', 'ETCH A REPLY'];
    let pos = -1;
    for (const needle of order) { const i = h.indexOf(needle, pos + 1); expect(i, needle).toBeGreaterThan(pos); pos = i; }
    expect((h.match(/class="who-line"/g) || []).length).toBe(3);
    // every bubble is a crawlable permalink, not just a client action
    expect((h.match(/<a class="bubble-text" href="\/m\//g) || []).length).toBe(4);
    expect(h).not.toContain('bubble-text" data-action');
    const empty = FV.chatHTML(view({ pathname: '/a/bc1qx/chat', address: 'bc1qx', chat: { messages: [], participants: [], nextBefore: null } }));
    expect(empty).toContain('page-title">bc1qx<');
    expect(empty).toContain('No messages in this room yet.');
    expect(empty).not.toContain('id="keb"');
    expect(FV.chatHTML(view({ pathname: '/rooms', chat: null }))).toContain('page-title">Chat rooms<');
  });

  it('the inlined client copy renders the message page and chat rooms identically too', () => {
    const ui = readFileSync(new URL('../src/ui.ts', import.meta.url), 'utf8');
    const src = ui.slice(ui.indexOf('/*__FEEDVIEW_START__*/'), ui.indexOf('/*__FEEDVIEW_END__*/')).replace(/\\\$\{/g, '${').replace(/\\`/g, '`').replace(/\\\\/g, '\\');
    const clientFV = new Function(src + '\nreturn FV;')() as typeof FV;
    const chat = { participants: [{ address: bie1.address, label: 'Whitehat' }], messages: [{ ...text, sender: 'bc1qanon' }, { ...bie1, block_time: 1_700_100_000 }, { ...image, sender: bie1.address, block_time: 1_700_100_100 }], nextBefore: null };
    for (const v of [
      view({ pathname: '/m/' + bie1.txid, detail: bie1, related: [text, proto] }),
      view({ pathname: '/m/' + proto.txid, detail: withOps, related: [] }),
      view({ pathname: '/m/x', detail: pgpEnc }),
      view({ pathname: '/m/y', detail: image, related: [signed] }),
      view({ pathname: '/c/coldcard-exploit-bulletin-board/chat', filter: 1, chat }),
      view({ pathname: '/rooms', filter: 2, chat }),
      view({ pathname: '/a/' + bie1.address + '/chat', address: bie1.address, chat }),
    ]) {
      if (v.detail) expect(clientFV.detailHTML(v as never)).toBe(FV.detailHTML(v as never));
      else expect(clientFV.chatHTML(v)).toBe(FV.chatHTML(v));
    }
  });
});
