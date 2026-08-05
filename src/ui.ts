/**
 * Single-page web UI served by the Worker at GET /.
 * Vanilla JS, no build step. Rendered as a template string so the whole app
 * ships inside the one Worker bundle.
 */

const CATEGORY_COLORS: Record<string, string> = {
  'Laundry / Service Ads': '#0ea5e9',
  'Begging / Victim Appeals': '#f59e0b',
  'Threats / Hostility': '#ef4444',
  'Prompt Injection': '#a855f7',
  'Haiku / Philosophical': '#10b981',
  'Self-deprecating / Black Humor': '#ec4899',
  Other: '#64748b',
};

export function renderIndex(): string {
  const colors = JSON.stringify(CATEGORY_COLORS);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>OP_RETURN Monitor</title>
<style>
  :root {
    --bg: #f8fafc; --card: #ffffff; --border: #e2e8f0; --text: #0f172a;
    --muted: #64748b; --accent: #f7931a;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0f172a; --card: #1e293b; --border: #334155;
      --text: #e2e8f0; --muted: #94a3b8;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: var(--bg); color: var(--text); line-height: 1.5;
  }
  header {
    padding: 18px 20px; border-bottom: 1px solid var(--border);
    display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap;
  }
  header h1 { margin: 0; font-size: 1.25rem; letter-spacing: -0.02em; }
  header h1 span { color: var(--accent); }
  header .sub { color: var(--muted); font-size: 0.85rem; }
  .wrap { max-width: 900px; margin: 0 auto; padding: 16px; }
  .collections { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
  .chip {
    border: 1px solid var(--border); background: var(--card); color: var(--text);
    border-radius: 999px; padding: 7px 14px; font-size: 0.85rem; cursor: pointer;
    display: inline-flex; align-items: center; gap: 6px;
  }
  .chip:hover { border-color: var(--accent); }
  .chip.active { border-color: var(--accent); background: rgba(247,147,26,0.12); }
  .chip .count { color: var(--muted); font-size: 0.75rem; }
  .toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
  .seg { display: inline-flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  .seg button {
    border: 0; background: var(--card); color: var(--muted); padding: 7px 16px; cursor: pointer; font-size: 0.85rem;
  }
  .seg button.active { background: var(--accent); color: #fff; }
  .meta { color: var(--muted); font-size: 0.85rem; }
  .msg {
    background: var(--card); border: 1px solid var(--border); border-radius: 10px;
    padding: 14px 16px; margin-bottom: 12px;
  }
  .msg pre.content {
    margin: 0 0 10px; white-space: pre-wrap; word-break: break-word;
    font-family: inherit; font-size: 0.95rem; color: var(--text);
  }
  .msg .row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 0.8rem; color: var(--muted); }
  .badge { border-radius: 6px; padding: 2px 8px; font-size: 0.72rem; color: #fff; font-weight: 600; }
  .badge.mempool { background: #6366f1; }
  .addr { font-family: ui-monospace, Menlo, monospace; font-size: 0.75rem; }
  .txid { color: var(--muted); text-decoration: none; border-bottom: 1px dotted var(--muted); }
  .time { margin-left: auto; }
  .like {
    display: inline-flex; align-items: center; gap: 5px; border: 1px solid var(--border);
    background: var(--card); border-radius: 999px; padding: 4px 12px; cursor: pointer;
    color: var(--muted); font-size: 0.8rem; margin-left: 8px;
  }
  .like:hover { border-color: var(--accent); }
  .like.liked { color: var(--accent); border-color: var(--accent); cursor: default; }
  .like .heart { font-size: 0.9rem; }
  .empty { color: var(--muted); text-align: center; padding: 40px 0; }
  .btn-more {
    display: block; margin: 12px auto; border: 1px solid var(--border); background: var(--card);
    color: var(--text); border-radius: 8px; padding: 10px 20px; cursor: pointer; font-size: 0.85rem;
  }
  .btn-more:hover { border-color: var(--accent); }
  #status { color: var(--muted); font-size: 0.8rem; text-align: center; padding: 8px 0; }
</style>
</head>
<body>
<header>
  <h1><span>OP_RETURN</span> Monitor</h1>
  <span class="sub">Bitcoin on-chain messages</span>
</header>
<div class="wrap">
  <div class="collections" id="collections"></div>
  <div class="toolbar">
    <div class="seg">
      <button data-sort="hot" class="active">Hottest</button>
      <button data-sort="new">Newest</button>
    </div>
    <span class="meta" id="meta"></span>
  </div>
  <div id="feed"></div>
  <button class="btn-more" id="more" style="display:none">Load more</button>
  <div id="status"></div>
</div>
<script>
(function () {
  var COLORS = ${colors};
  var state = { collectionId: null, sort: 'hot', limit: 50, before: null, liked: {} };

  var $ = function (id) { return document.getElementById(id); };
  var collectionsEl = $('collections'), feedEl = $('feed'), metaEl = $('meta'),
      moreBtn = $('more'), statusEl = $('status');

  try { state.liked = JSON.parse(localStorage.getItem('opreturn_liked') || '{}'); } catch (e) {}

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function setStatus(msg) { statusEl.textContent = msg || ''; }

  function fmtTime(ts) {
    if (!ts) return '';
    var d = new Date(ts.replace(' ', 'T') + 'Z');
    if (isNaN(d)) return ts;
    return d.toLocaleString();
  }

  function short(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n) + '...' : s; }

  function loadCollections() {
    fetch('/api/collections').then(function (r) { return r.json(); }).then(function (cols) {
      collectionsEl.innerHTML = '';
      var all = document.createElement('button');
      all.className = 'chip active';
      all.textContent = 'All';
      all.addEventListener('click', function () { selectCollection(null, all); });
      collectionsEl.appendChild(all);

      cols.forEach(function (c) {
        var b = document.createElement('button');
        b.className = 'chip';
        b.innerHTML = esc(c.name) + ' <span class="count">' + c.message_count + '</span>';
        b.addEventListener('click', function () { selectCollection(c.id, b); });
        collectionsEl.appendChild(b);
      });
    }).catch(function () { setStatus('Failed to load collections'); });
  }

  function selectCollection(id, btn) {
    state.collectionId = id;
    state.before = null;
    feedEl.innerHTML = '';
    moreBtn.style.display = 'none';
    var chips = collectionsEl.querySelectorAll('.chip');
    for (var i = 0; i < chips.length; i++) chips[i].classList.remove('active');
    if (btn) btn.classList.add('active');
    loadMessages(true);
  }

  function renderMessage(m) {
    var el = document.createElement('div');
    el.className = 'msg';
    var liked = !!state.liked[m.id];
    var cat = m.category ? '<span class="badge" style="background:' + (COLORS[m.category] || COLORS['Other']) + '">' + esc(m.category) + '</span>' : '';
    var mempool = m.is_mempool ? '<span class="badge mempool">mempool</span>' : '';
    var addr = esc(m.address);
    var txlink = '<a class="txid" target="_blank" rel="noopener" href="https://mempool.space/tx/' + esc(m.txid) + '">' + esc(short(m.txid, 18)) + '</a>';
    el.innerHTML =
      '<pre class="content">' + esc(m.content) + '</pre>' +
      '<div class="row">' + cat + mempool +
      '<span class="addr">' + addr + '</span>' + txlink +
      '<span class="time">' + esc(fmtTime(m.created_at)) + '</span>' +
      '<button class="like' + (liked ? ' liked' : '') + '" data-id="' + m.id + '"' + (liked ? ' disabled' : '') + '>' +
        '<span class="heart">' + (liked ? '&#10084;' : '&#9825;') + '</span> ' + m.likes + '</button>' +
      '</div>';
    el.querySelector('.like').addEventListener('click', function (e) {
      likeMessage(m.id, e.currentTarget, m);
    });
    return el;
  }

  function loadMessages(append) {
    var q = '/api/messages?sort=' + state.sort + '&limit=' + state.limit;
    if (state.collectionId) q += '&collection_id=' + state.collectionId;
    if (state.before) q += '&before=' + state.before;
    setStatus('Loading...');
    fetch(q).then(function (r) { return r.json(); }).then(function (data) {
      setStatus('');
      if (!append) feedEl.innerHTML = '';
      if (!data.messages.length && !append) {
        feedEl.innerHTML = '<div class="empty">No messages yet — waiting for the next poll.</div>';
        moreBtn.style.display = 'none';
        return;
      }
      data.messages.forEach(function (m) { feedEl.appendChild(renderMessage(m)); });
      state.before = data.next_before;
      moreBtn.style.display = data.next_before ? 'block' : 'none';
    }).catch(function () { setStatus('Failed to load messages'); });
  }

  function likeMessage(id, btn, msg) {
    if (btn.disabled) return;
    fetch('/api/like', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message_id: id })
    }).then(function (r) { return r.json().then(function (d) { return { status: r.status, d: d }; }); })
      .then(function (res) {
        if (res.d.ok) {
          state.liked[id] = true;
          localStorage.setItem('opreturn_liked', JSON.stringify(state.liked));
          btn.classList.add('liked');
          btn.disabled = true;
          btn.innerHTML = '<span class="heart">&#10084;</span> ' + res.d.likes;
        } else if (res.status === 409) {
          state.liked[id] = true;
          localStorage.setItem('opreturn_liked', JSON.stringify(state.liked));
          btn.classList.add('liked');
          btn.disabled = true;
        }
      }).catch(function () { setStatus('Like failed'); });
  }

  moreBtn.addEventListener('click', function () { loadMessages(true); });
  document.querySelectorAll('.seg button').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.seg button').forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      state.sort = b.getAttribute('data-sort');
      state.before = null;
      feedEl.innerHTML = '';
      loadMessages(false);
    });
  });

  loadCollections();
})();
</script>
</body>
</html>`;
}
