import { Hono } from 'hono';
import type { Context } from 'hono';
import seedCollections from '../collections.json';
import { aiHeaders, categoryFromSlug, categorySlug, isCategory } from './classify';
import { classifyOnePass } from './cron';
import { runCron } from './cron';
import * as db from './db';
import { fetchHistoricalPriceUsd, mempoolHosts } from './mempool';
import { ingestOne, ingestStatus, resetIngestCursors } from './ingest';
import { TAG_MIN_REPEATS, backfillDetails, reparseLegacy, reparseTextRows, sweepTags } from './cron';
import { protocolLabel } from './protocols';
import { getGuide, guideJsonLd, guideMinutes, listGuides, loadFacts, renderGuide, renderGuideHtml, renderLearnIndexHtml } from './learn';
import {
  addressCardSvg,
  categoryCardSvg,
  chatCardSvg,
  collectionCardSvg,
  midEllipsis,
  defaultCardSvg,
  faviconSvg,
  iconPng,
  messageCardSvg,
  pngResponse,
  svgToPng,
} from './og';
import {
  buildBreadcrumbSchema,
  buildCollectionSchema,
  buildFaqSchema,
  buildGuideHowToSchema,
  buildMessageSchema,
  buildWebSiteGraph,
  generateAgentCardJson,
  generateAgentSkillsIndexJson,
  generateApiCatalogJson,
  generateAuthMd,
  generateSkillMd,
  generateLlmsFullTxt,
  generateLlmsTxt,
  generateMcpServerCardJson,
  generateOAuthProtectedResourceJson,
  generateOAuthServerJson,
  generateOpenApiJson,
  generateRobotsTxt,
  generateSitemapXml,
  renderAddressMarkdown,
  renderCategoryMarkdown,
  renderCollectionMarkdown,
  renderCollectionExtras,
  renderFeedPage,
  generateSitemapIndexXml,
  generateMessagesSitemapXml,
  renderDetailPage,
  renderChatPage,
  renderCollectionsMarkdown,
  renderCollectionsSsr,
  renderFeedMarkdown,
  renderGuideMarkdown,
  renderGuideSsr,
  renderLandingMarkdown,
  renderLandingSsr,
  renderMessageMarkdown,
  messageHeadline,
  messageExcerpt,
  renderNotFoundSsr,
  escHtml,
  renderProtocolMarkdown,
  renderProtocolsSsr,
  renderProtocolsMarkdown,
  renderTickMarkdown,
  renderBlockMarkdown,
} from './seo';
import { ensureSeeded, slugify } from './seed';
import type { ChatCardData } from './og';
import type { ChatMessage, CollectionWithStats, Env } from './types';
import { renderIndex, UMAMI_TAG, type ShellData } from './ui';
import FV, { type FeedView } from './feedview.js';
import { hubConfig } from './indexnow';

// ---------------------------------------------------------------------------
// App shell data (sidebar collection rows + chain tip). Cached per isolate and
// refreshed in the background so page routes stay free of extra awaits.
// ---------------------------------------------------------------------------
let shellCache: { at: number; data: ShellData } | null = null;
let shellRefreshing: Promise<void> | null = null;

async function refreshShell(d1: D1Database, origin: string): Promise<void> {
  try {
    const [cols, stats, recent, protocols, categories] = await Promise.all([
      db.listCollections(d1),
      db.getChainStats(d1),
      db.listRecentBlocks(d1, 6),
      // The two aggregations over ops are the heaviest reads; share them across isolates via the edge cache.
      cachedValue(origin, 'protocols:1:0', 300, protocolStats(d1, 0)),
      // Not an API key (the categories endpoint is uncached); shell-only.
      cachedValue<db.CategoryStat[]>(origin, 'shell:categories:1', 300, () => db.listCategories(d1)),
    ]);
    shellCache = {
      at: Date.now(),
      data: {
        collections: cols.map((col) => ({ slug: col.slug || String(col.id), name: col.name, count: col.message_count })),
        tip: stats.highest_height,
        counts: {
          feed: stats.stored_txs || cols.reduce((t, col) => t + (col.message_count || 0), 0),
          rooms: cols.length,
          protocols: protocols.length,
          collections: cols.length,
        },
        feed: {
          collections: cols.map((col) => ({ id: col.id, name: col.name, slug: col.slug, description: col.description, message_count: col.message_count })),
          categories,
          protocols: protocols.filter((p) => p.protocol !== 'text'),
          chain: { ...stats, recent },
        },
      },
    };
  } catch {
    // Keep whatever we had, but don't retry on every request during a DB blip.
    shellCache = { at: Date.now() - 45000, data: shellCache ? shellCache.data : {} };
  } finally {
    shellRefreshing = null;
  }
}

/**
 * A cold isolate waits for the two small queries once (so crawlers always get
 * the sidebar links); afterwards pages read the cache and refresh it in the
 * background every minute.
 */
async function shellFor(c: Context<Bindings>): Promise<ShellData> {
  const fresh = shellCache && Date.now() - shellCache.at < 60000;
  if (fresh) return shellCache!.data;
  if (!shellRefreshing) shellRefreshing = refreshShell(c.env.DB, originOf(c));
  if (!shellCache) {
    await shellRefreshing;
    return shellCache ? (shellCache as { data: ShellData }).data : {};
  }
  try {
    c.executionCtx.waitUntil(shellRefreshing);
  } catch {
    // no execution context (tests); the promise still runs
  }
  return shellCache.data;
}

type Bindings = { Bindings: Env };

const app = new Hono<Bindings>();

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function intEnv(env: Env, key: 'AI_MAX_PER_RUN', fallback: number): number {
  const v = Number(env[key]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

async function sha256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Proof-of-work for likes: the client mines a nonce so that
// sha256(`${message_id}:${nonce}`) has POW_BITS leading zero bits. This is a
// thematic, on-chain-flavored speed bump (~65k hashes at 16 bits, sub-second in
// a real browser) — NOT the primary anti-abuse control. The voter fingerprint
// below is what actually dedupes votes.
const POW_BITS = 16;

function hasLeadingZeroBits(hex: string, bits: number): boolean {
  const fullZeroNibbles = bits >> 2;
  if (hex.slice(0, fullZeroNibbles) !== '0'.repeat(fullZeroNibbles)) return false;
  const remainder = bits & 3;
  if (remainder === 0) return true;
  const nibble = parseInt(hex[fullZeroNibbles] || 'f', 16);
  return nibble >> (4 - remainder) === 0;
}

// ---------------------------------------------------------------------------
// Public routes
// ---------------------------------------------------------------------------

app.get('/api/health', (c) => c.json({ ok: true, time: new Date().toISOString() }));

/**
 * USD price at a timestamp, through the edge cache so the message page (server)
 * and the client's /api/price call resolve the same figure. Past days are
 * keyed per day and kept for a day; today is keyed per ten minutes.
 */
async function priceUsdAt(c: Context<Bindings>, ts: number): Promise<number | null> {
  const now = Math.floor(Date.now() / 1000);
  const past = now - ts > 86400;
  // Past blocks: the price at the start of the block's hour; today: ten-minute buckets.
  const bucket = past ? Math.floor(ts / 3600) * 3600 : Math.floor(ts / 600) * 600;
  return cachedValue<number | null>(originOf(c), `price:${bucket}`, past ? 86400 : 600, () =>
    fetchHistoricalPriceUsd(mempoolHosts(c.env), bucket).catch(() => null)
  );
}

/** `promise`, or `fallback` when it takes longer than `ms`; the promise keeps running (and caching) in the background. */
function within<T>(ms: number, promise: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

/** One rule for both /a/:address pages: monitored addresses, or at least three rows in the address feed, are indexable. */
function addressIndexable(monitored: boolean, addressRows: number): boolean {
  return monitored || addressRows >= 3;
}

function feeUsdText(feeSats: number | null | undefined, usd: number | null): string {
  return feeSats != null && typeof usd === 'number' ? `\u2248 $${((feeSats / 1e8) * usd).toFixed(2)}` : '';
}

app.get('/api/price', async (c) => {
  const now = Math.floor(Date.now() / 1000);
  const raw = Number(c.req.query('ts'));
  const ts = Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), now) : now;
  const usd = await priceUsdAt(c, ts);
  // Past-day prices never change; today's price can drift.
  const maxAge = usd == null ? 60 : now - ts > 86400 ? 86400 : 600;
  return c.json({ usd }, 200, { 'cache-control': `public, max-age=${maxAge}` });
});

app.get('/api/collections', async (c) => {
  return c.json(await db.listCollections(c.env.DB));
});

app.get('/api/messages', async (c) => {
  const rawCollection = c.req.query('collection_id');
  const collectionId = rawCollection ? Number(rawCollection) : undefined;
  const address = c.req.query('address') || undefined;
  const rawCategory = c.req.query('category');
  const category = rawCategory ? categoryFromSlug(rawCategory) ?? undefined : undefined;
  const sort = c.req.query('sort') === 'hot' ? ('hot' as const) : ('new' as const);
  const limit = Math.min(Math.max(Number(c.req.query('limit')) || 50, 1), 100);
  const before = c.req.query('before') || undefined;
  const protocol = slugParam(c.req.query('protocol'));
  const tick = tickParam(c.req.query('tick'));
  const rawBlock = Number(c.req.query('block'));
  const blockHeight = Number.isInteger(rawBlock) && rawBlock > 0 ? rawBlock : undefined;
  // The global feed shows human messages unless asked for every protocol;
  // collection / address / protocol / tick / block views always show everything.
  const scoped = Boolean(collectionId || address || category || protocol || tick || blockHeight);
  const kind = c.req.query('kind') === 'all' || scoped ? ('all' as const) : ('text' as const);

  const data = await db.getMessages(c.env.DB, {
    collectionId,
    address,
    category,
    protocol,
    tick,
    kind,
    blockHeight,
    sort,
    limit,
    before,
  });
  return c.json(data);
});

/** Protocol slugs are lowercase [a-z0-9._-]; anything else is not a protocol. */
function slugParam(raw: string | undefined): string | undefined {
  const s = String(raw ?? '').trim().toLowerCase();
  return /^[a-z0-9._-]{1,32}$/.test(s) ? s : undefined;
}

/** Tickers are stored as written on-chain (case preserved), bounded in length. */
function tickParam(raw: string | undefined): string | undefined {
  const s = String(raw ?? '').trim();
  return s.length >= 1 && s.length <= 64 ? s : undefined;
}

/**
 * Aggregations over the ops/blocks tables are the only queries that touch
 * every row; serve them from the edge cache for a few minutes. Workers do not
 * cache their own responses unless asked, hence the explicit Cache API use.
 */
/** One key builder for every edge-cache entry, so routes and the shell refresh share hits. */
function cacheRequest(origin: string, cacheKey: string): Request {
  // Key on a normalised name, not the raw query string, so callers cannot
  // mint unlimited cache misses by varying parameters.
  return new Request(`${origin}/__cache/${cacheKey}`, { method: 'GET' });
}

function jsonHeaders(ttlSeconds: number): Record<string, string> {
  return {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': `public, max-age=${ttlSeconds}, s-maxage=${ttlSeconds}, stale-while-revalidate=${ttlSeconds * 2}`,
    'access-control-allow-origin': '*',
  };
}

/**
 * The single edge-cache store for aggregation results. Every entry is the
 * public API's own Response (same body shape, same headers), so a route and
 * the shell refresh reading the same key can never see different things.
 */
async function cachedValue<T>(origin: string, cacheKey: string, ttlSeconds: number, compute: () => Promise<T>): Promise<T> {
  const cache = (caches as unknown as { default: Cache }).default;
  const key = cacheRequest(origin, cacheKey);
  const hit = await cache.match(key).catch(() => undefined);
  if (hit) return (await hit.json()) as T;
  const value = await compute();
  await cache.put(key, new Response(JSON.stringify(value), { headers: jsonHeaders(ttlSeconds) })).catch(() => undefined);
  return value;
}

async function cachedJson(
  c: Context<Bindings>,
  ttlSeconds: number,
  cacheKey: string,
  compute: () => Promise<unknown>
): Promise<Response> {
  const value = await cachedValue(new URL(c.req.url).origin, cacheKey, ttlSeconds, compute);
  return new Response(JSON.stringify(value), { headers: jsonHeaders(ttlSeconds) });
}

/** What /api/protocols serves; the shell reads the same key, so the shape must be this one. */
function protocolStats(d1: D1Database, days: number) {
  return async () => {
    const stats = await db.listProtocols(d1, days);
    return stats.map((s) => ({ ...s, label: protocolLabel(s.protocol) }));
  };
}

/** Aggregation windows are quantised so the cache has a handful of keys, not one per query string. 0 = all time (default). */
function daysParam(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return [1, 7, 30, 90, 365].reduce((best, d) => (Math.abs(d - n) < Math.abs(best - n) ? d : best), 30);
}

app.get('/api/protocols', (c) => {
  const days = daysParam(c.req.query('days'));
  // Key version 1: the shape gained last_ts (sitemap lastmod). Bump on every shape change.
  return cachedJson(c, 300, `protocols:1:${days}`, protocolStats(c.env.DB, days));
});

app.get('/api/ticks', (c) => {
  const days = daysParam(c.req.query('days'));
  const protocol = slugParam(c.req.query('protocol'));
  const limit = Number(c.req.query('limit')) > 100 ? 500 : 100;
  return cachedJson(c, 300, `ticks:1:${days}:${protocol ?? ''}:${limit}`, () =>
    db.listTicks(c.env.DB, protocol, days, limit)
  );
});

app.get('/api/chain', (c) =>
  cachedJson(c, 60, 'chain', async () => {
    const [stats, recent] = await Promise.all([db.getChainStats(c.env.DB), db.listRecentBlocks(c.env.DB, 20)]);
    return { ...stats, recent };
  })
);

app.get('/api/block/:height', async (c) => {
  const height = Number(c.req.param('height'));
  if (!Number.isInteger(height) || height < 0) return jsonError('invalid height', 400);
  const block = await db.getBlock(c.env.DB, height);
  if (!block) return jsonError('block not scanned', 404);
  return c.json(block, 200, { 'cache-control': 'public, max-age=300' });
});

app.get('/api/chat', async (c) => {
  const rawCollection = c.req.query('collection_id');
  const collectionId = rawCollection ? Number(rawCollection) : undefined;
  const address = c.req.query('address') || undefined;
  if (!collectionId && !address) return c.json({ error: 'collection_id or address required' }, 400);
  const limit = Math.min(Math.max(Number(c.req.query('limit')) || 200, 1), 200);
  const before = c.req.query('before') || undefined;
  return c.json(await db.getChat(c.env.DB, { collectionId, address, limit, before }));
});

app.get('/api/categories', async (c) => {
  const stats = await db.listCategories(c.env.DB);
  return c.json(
    stats.map((s) => ({ ...s, slug: categorySlug(s.category) }))
  );
});

app.get('/api/message/:key', async (c) => {
  const key = c.req.param('key');
  const msg = /^\d+$/.test(key)
    ? await db.getMessage(c.env.DB, Number(key))
    : await db.getMessageByTxid(c.env.DB, key);
  if (!msg) return jsonError('message not found', 404);
  return c.json(msg);
});

const handleVote = async (c: Context<Bindings>) => {
  const body = (await c.req.json().catch(() => null)) as
    | { message_id?: unknown; nonce?: unknown; direction?: unknown }
    | null;
  const messageId = Number(body?.message_id);
  if (!Number.isInteger(messageId) || messageId <= 0) {
    return jsonError('invalid message_id', 400);
  }

  // Verify the client-mined proof-of-work before doing any DB work.
  const nonce = body?.nonce;
  if (typeof nonce !== 'number' && typeof nonce !== 'string') {
    return jsonError('proof-of-work required', 400);
  }
  const powHash = await sha256(`${messageId}:${nonce}`);
  if (!hasLeadingZeroBits(powHash, POW_BITS)) {
    return jsonError('invalid proof-of-work', 400);
  }

  const msg = await db.getMessage(c.env.DB, messageId);
  if (!msg) return jsonError('message not found', 404);

  const ip =
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown';
  const ua = c.req.header('user-agent') || 'unknown';
  const voterHash = await sha256(`${ip}|${ua}`);

  if (await db.getVote(c.env.DB, messageId, voterHash)) {
    return jsonError('already voted', 409);
  }

  const dir = body?.direction === 'down' ? 'down' : 'up';
  await db.addVote(c.env.DB, messageId, voterHash, dir);
  const updated = await db.getMessage(c.env.DB, messageId);
  return c.json(
    { ok: true, likes: updated?.likes ?? 0, direction: dir },
    200,
    { 'access-control-allow-origin': '*' }
  );
};

app.post('/api/like', handleVote);
app.post('/api/vote', handleVote);

// Public address suggestions. Untrusted input is validated + proof-of-worked,
// then queued as `pending` for admin review — never written into `addresses`
// directly (that table drives the on-chain scanner).
const BTC_ADDR = /^(bc1[a-z0-9]{6,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,39})$/;

app.post('/api/suggest', async (c) => {
  const body = (await c.req.json().catch(() => null)) as
    | { address?: unknown; collection_id?: unknown; note?: unknown; nonce?: unknown }
    | null;
  const address = typeof body?.address === 'string' ? body.address.trim() : '';
  if (!BTC_ADDR.test(address)) return jsonError('invalid address', 400);

  const nonce = body?.nonce;
  if (typeof nonce !== 'number' && typeof nonce !== 'string') {
    return jsonError('proof-of-work required', 400);
  }
  const powHash = await sha256(`${address}:${nonce}`);
  if (!hasLeadingZeroBits(powHash, POW_BITS)) return jsonError('invalid proof-of-work', 400);

  const rawCol = Number(body?.collection_id);
  const collectionId = Number.isInteger(rawCol) && rawCol > 0 ? rawCol : null;
  const note = typeof body?.note === 'string' ? body.note.slice(0, 280) : null;

  const ip =
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown';
  const ua = c.req.header('user-agent') || 'unknown';
  const voterHash = await sha256(`${ip}|${ua}`);

  const res = await db.createSuggestion(c.env.DB, address, collectionId, note, voterHash);
  if (!res.ok) {
    const dup = res.error === 'already monitored' || res.error === 'already suggested';
    return jsonError(res.error ?? 'could not submit', dup ? 409 : 400);
  }
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Admin routes (protected by X-Admin-Key header)
// ---------------------------------------------------------------------------

async function adminGuard(
  c: Context<Bindings>,
  next: () => Promise<void>
): Promise<Response | void> {
  const key = c.env.ADMIN_KEY;
  if (!key) return c.json({ ok: false, error: 'admin API not configured' }, 503);
  const provided = c.req.header('x-admin-key');
  if (!provided || provided !== key) {
    return c.json({ ok: false, error: 'unauthorized' }, 401);
  }
  await next();
}

app.post('/api/admin/collections', adminGuard, async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    name?: unknown;
    description?: unknown;
    slug?: unknown;
  } | null;
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) return jsonError('name is required', 400);
  const description = typeof body?.description === 'string' ? body.description : null;
  const slug = typeof body?.slug === 'string' && body.slug.trim() ? body.slug.trim() : slugify(name);
  const id = await db.createCollection(c.env.DB, name, description, slug);
  return c.json({ ok: true, id, slug });
});

app.post('/api/admin/addresses', adminGuard, async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    address?: unknown;
    label?: unknown;
    collection_id?: unknown;
  } | null;
  const address = typeof body?.address === 'string' ? body.address.trim() : '';
  const collectionId = Number(body?.collection_id);
  if (!address) return jsonError('address is required', 400);
  if (!Number.isInteger(collectionId)) return jsonError('collection_id is required', 400);

  const label = typeof body?.label === 'string' ? body.label : null;
  const res = await db.createAddress(c.env.DB, address, label, collectionId);
  if (!res.ok) return jsonError(res.error ?? 'failed to create address', 400);
  return c.json({ ok: true });
});

app.delete('/api/admin/addresses/:id', adminGuard, async (c) => {
  const id = Number(c.req.param('id'));
  const ok = await db.deleteAddress(c.env.DB, id);
  return c.json({ ok });
});

app.get('/api/admin/addresses', adminGuard, async (c) => {
  return c.json(await db.listAddresses(c.env.DB));
});

app.delete('/api/admin/collections/:id', adminGuard, async (c) => {
  const id = Number(c.req.param('id'));
  const res = await c.env.DB.prepare('DELETE FROM collections WHERE id = ?').bind(id).run();
  return c.json({ ok: res.meta.changes > 0 });
});

app.post('/api/admin/seed', adminGuard, async (c) => {
  await ensureSeeded(c.env.DB);
  return c.json({ ok: true });
});

/**
 * Manual IndexNow push: { urls: string[] } (site-relative or absolute on our
 * host) or { all: true } to re-announce everything the hub knows. `all`
 * counts against the hub's daily cap (2,000), so the cron's own pushes may
 * be refused for the rest of the day after a large re-announce.
 */
app.post('/api/admin/indexnow', adminGuard, async (c) => {
  const cfg = hubConfig(c.env);
  if (!cfg) return jsonError('INDEXNOW_HUB_TOKEN not configured', 503);
  const body = (await c.req.json().catch(() => null)) as { urls?: unknown; all?: unknown } | null;
  let payload: { host: string; urls?: string[]; all?: true };
  if (body?.all === true) payload = { host: cfg.host, all: true };
  else {
    if (!Array.isArray(body?.urls) || !body.urls.length || body.urls.length > 10000) return jsonError('send urls: string[] (1-10000) or all: true', 400);
    const urls: string[] = [];
    for (const raw of body.urls) {
      if (typeof raw !== 'string') return jsonError('urls must be strings', 400);
      const u = raw.startsWith('/') ? `https://${cfg.host}${raw}` : raw;
      let parsed: URL;
      try {
        parsed = new URL(u);
      } catch {
        return jsonError(`not a URL: ${raw}`, 400);
      }
      if (parsed.protocol !== 'https:' || parsed.host.toLowerCase() !== cfg.host) return jsonError(`not on ${cfg.host}: ${raw}`, 400);
      urls.push(parsed.toString());
    }
    payload = { host: cfg.host, urls: [...new Set(urls)] };
  }
  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: { authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json', 'user-agent': 'opreturn-indexnow/1.0 (+https://opreturn.xyz)' },
    body: JSON.stringify(payload),
  }).catch((e) => new Response(JSON.stringify({ error: String(e).slice(0, 120) }), { status: 502 }));
  const text = await res.text();
  return new Response(text, { status: res.status, headers: { 'content-type': 'application/json' } });
});

app.post('/api/admin/classify', adminGuard, async (c) => {
  const max = intEnv(c.env, 'AI_MAX_PER_RUN', 50);
  const remaining = await db.countUnclassified(c.env.DB);
  const classified = await classifyOnePass(c.env, max);
  return c.json({ ok: true, classified, remaining: Math.max(0, remaining - classified) });
});

app.post('/api/admin/ai-test', adminGuard, async (c) => {
  const base = (c.env.OPENAI_API_BASE || '').replace(/\/+$/, '');
  const model = c.env.OPENAI_MODEL || '';
  const key = c.env.OPENAI_API_KEY || '';
  const url = `${base}/chat/completions`;
  const t0 = Date.now();
  let info: Record<string, unknown>;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: aiHeaders(key, crypto.randomUUID()),
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 2048,
        messages: [
          { role: 'user', content: 'Reply with exactly: OK' },
        ],
      }),
    });
    const text = await res.text();
    info = {
      status: res.status,
      ok: res.ok,
      body: text.slice(0, 300),
      ms: Date.now() - t0,
      base,
      model,
      keySet: Boolean(key),
      keyPrefix: key ? key.slice(0, 8) + '...' : '',
    };
  } catch (e) {
    info = { error: String(e), ms: Date.now() - t0, base, model, keySet: Boolean(key) };
  }
  return c.json({ ok: true, info });
});

/** Re-derive protocol/ops for legacy rows now instead of waiting for the cron. */
app.post('/api/admin/reparse', adminGuard, async (c) => {
  // ?scope=text re-runs the detectors over rows already filed as text
  // (keyset: pass back next_after until it is null).
  if (c.req.query('scope') === 'untag') {
    const tag = (c.req.query('tag') || '').trim();
    if (!tag) return jsonError('tag required', 400);
    return c.json({ ok: true, tag, rows: await db.untag(c.env.DB, tag) });
  }
  if (c.req.query('scope') === 'tags') {
    const min = Math.max(Number(c.req.query('min')) || TAG_MIN_REPEATS, 5);
    return c.json({ ok: true, ...(await sweepTags(c.env.DB, min)) });
  }
  if (c.req.query('scope') === 'text') {
    const after = Math.max(Number(c.req.query('after')) || 0, 0);
    const limit = Math.min(Math.max(Number(c.req.query('limit')) || 500, 1), 1000);
    const r = await reparseTextRows(c.env.DB, after, limit);
    return c.json({ ok: true, ...r });
  }
  const max = Math.min(Math.max(Number(c.req.query('max')) || 500, 1), 2000);
  let total = 0;
  while (total < max) {
    const n = await reparseLegacy(c.env.DB, Math.min(200, max - total));
    total += n;
    if (n === 0) break;
  }
  return c.json({ ok: true, reparsed: total });
});

/** Human-text group representatives for the offline reclassifier (keyset by id). */
app.get('/api/admin/messages/text', adminGuard, async (c) => {
  const after = Math.max(Number(c.req.query('after')) || 0, 0);
  const limit = Math.min(Math.max(Number(c.req.query('limit')) || 500, 1), 500);
  const rows = await db.listTextRows(c.env.DB, after, limit);
  return c.json({ ok: true, rows, next_after: rows.length < limit ? null : rows[rows.length - 1].id });
});

/** Bulk category writes: [{ id, category|null }], <= 200 per call; duplicates inherit. */
app.post('/api/admin/categories', adminGuard, async (c) => {
  const body = (await c.req.json().catch(() => null)) as unknown;
  if (!Array.isArray(body) || body.length === 0 || body.length > 200) return jsonError('expected 1-200 assignments', 400);
  const assignments: db.CategoryAssignment[] = [];
  for (const item of body as Array<{ id?: unknown; category?: unknown }>) {
    const id = Number(item?.id);
    if (!Number.isInteger(id) || id <= 0) return jsonError(`invalid id: ${String(item?.id)}`, 400);
    if (item?.category === null) assignments.push({ id, category: null });
    else if (isCategory(item?.category)) assignments.push({ id, category: item.category });
    else return jsonError(`unknown category for id ${id}: ${String(item?.category)}`, 400);
  }
  const r = await db.setCategories(c.env.DB, assignments);
  return c.json({ ok: true, ...r });
});

app.post('/api/admin/details', adminGuard, async (c) => {
  const max = Math.min(Math.max(Number(c.req.query('max')) || 40, 1), 200);
  const filled = await backfillDetails(c.env.DB, mempoolHosts(c.env), max);
  return c.json({ ok: true, filled });
});

app.get('/api/admin/ingest/status', adminGuard, async (c) => {
  return c.json(await ingestStatus(c.env, mempoolHosts(c.env)));
});

/** Point the cursors at a height: { "height": 968900, "floor": 968000 }. */
app.post('/api/admin/ingest/reset', adminGuard, async (c) => {
  const body = (await c.req.json().catch(() => null)) as { height?: unknown; floor?: unknown } | null;
  const height = Number(body?.height);
  if (!Number.isInteger(height) || height <= 0) return jsonError('height required', 400);
  const floor = Number.isInteger(Number(body?.floor)) ? Number(body?.floor) : undefined;
  await resetIngestCursors(c.env, height, floor);
  return c.json({ ok: true, height, floor });
});

/** Ingest one specific block right now (does not move the cursors). */
app.post('/api/admin/ingest/block/:height', adminGuard, async (c) => {
  const height = Number(c.req.param('height'));
  if (!Number.isInteger(height) || height <= 0) return jsonError('invalid height', 400);
  try {
    const census = await ingestOne(c.env, mempoolHosts(c.env), height, {});
    return c.json({ ok: true, height, ...census });
  } catch (e) {
    console.error('ingest block failed', height, e);
    return jsonError('ingest failed; see worker logs', 502);
  }
});

app.post('/api/admin/seed-likes', adminGuard, async (c) => {
  const seeded = await db.seedInitialLikes(c.env.DB);
  return c.json({ ok: true, seeded });
});

app.get('/api/admin/suggestions', adminGuard, async (c) => {
  const status = c.req.query('status') || 'pending';
  return c.json(await db.listSuggestions(c.env.DB, status));
});

app.post('/api/admin/suggestions/:id/approve', adminGuard, async (c) => {
  const id = Number(c.req.param('id'));
  const res = await db.approveSuggestion(c.env.DB, id);
  if (!res.ok) return jsonError(res.error ?? 'approve failed', 400);
  return c.json({ ok: true });
});

app.post('/api/admin/suggestions/:id/reject', adminGuard, async (c) => {
  const id = Number(c.req.param('id'));
  const ok = await db.setSuggestionStatus(c.env.DB, id, 'rejected');
  return c.json({ ok });
});

// ---------------------------------------------------------------------------
// SPA pages + Open Graph (real paths so X/Slack/Telegram crawlers see per-item
// cards — crawlers do not execute JS and never send URL hash fragments)
// ---------------------------------------------------------------------------

function originOf(c: Context<Bindings>): string {
  return (c.env.SITE_URL || new URL(c.req.url).origin).replace(/\/+$/, '');
}

function shortAddr(a: string): string {
  return a.length > 16 ? a.slice(0, 10) + '\u2026' + a.slice(-4) : a;
}

function clamp(s: string, n: number): string {
  s = String(s ?? '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '\u2026' : s;
}

async function collectionMap(db_inst: D1Database): Promise<Map<number, CollectionWithStats>> {
  const cols = await db.listCollections(db_inst);
  return new Map(cols.map((c) => [c.id, c]));
}


/**
 * The view for a feed-style page, built the way the client builds its state
 * (same sort/kind defaults, same 50-row page) so the shared renderer emits
 * the markup the script will re-render to. Returns null only when the shell
 * cache is unavailable, which the caller treats as an empty rail.
 */
async function feedViewFor(
  c: Context<Bindings>,
  route: 'feed' | 'c' | 'a' | 'p' | 'tick' | 'block' | 'cat',
  base: Partial<FeedView>
): Promise<{ view: FeedView; shell: ShellData }> {
  const shell = await shellFor(c);
  const url = new URL(c.req.url);
  const sp = c.req.query('sort');
  const sort: 'hot' | 'new' = sp === 'hot' || sp === 'new' ? sp : FV.defaultSort(route);
  // The client forces kind=all on a/p/tick/block; c and cat keep the query's kind for the SHOW toggle.
  const kind: 'text' | 'all' = c.req.query('kind') === 'all' || route === 'a' || route === 'p' || route === 'tick' || route === 'block' ? 'all' : 'text';
  const q = c.req.query('q') || '';
  const before = FV.validCursor(c.req.query('before'));
  const feed = shell.feed || { collections: [], categories: [], protocols: [], chain: null };
  const view: FeedView = {
    pathname: url.pathname,
    search: url.search,
    sort,
    kind,
    q,
    before,
    filter: base.filter ?? null,
    address: base.address ?? null,
    category: base.category ?? null,
    protocol: base.protocol ?? null,
    tick: base.tick ?? null,
    block: base.block ?? null,
    blockRow: base.blockRow ?? null,
    feed: [],
    nextBefore: null,
    collections: feed.collections,
    categories: feed.categories,
    protocols: feed.protocols,
    ticks: base.ticks || [],
    chain: feed.chain,
    extraHtml: base.extraHtml || '',
  };
  // The request is the shared module's definition of it (what the client's feedQuery() sends);
  // the API's scoping rule (any filter => every kind) is applied the same way /api/messages does.
  const p = FV.feedParams(view);
  const scoped = Boolean(p.collection_id || p.address || p.category || p.protocol || p.tick || p.block);
  const page = await db
    .getMessages(c.env.DB, {
      collectionId: p.collection_id || undefined,
      address: p.address || undefined,
      category: p.category || undefined,
      protocol: p.protocol || undefined,
      tick: p.tick || undefined,
      blockHeight: p.block || undefined,
      kind: scoped ? 'all' : p.kind,
      sort: p.sort,
      limit: p.limit,
      before: p.before || undefined,
    })
    .catch(() => ({ messages: [] as import('./types').Message[], next_before: null as string | null }));
  view.feed = page.messages as unknown as FeedView['feed'];
  view.nextBefore = page.next_before;
  return { view, shell };
}

/** A view for the message page and chat rooms: shell data plus the page's own rows; no feed, sidebar hidden. */
async function pageViewFor(c: Context<Bindings>, base: Partial<FeedView>): Promise<{ view: FeedView; shell: ShellData }> {
  const shell = await shellFor(c);
  const url = new URL(c.req.url);
  const feed = shell.feed || { collections: [], categories: [], protocols: [], chain: null };
  const view: FeedView = {
    pathname: url.pathname,
    search: url.search,
    sort: 'new',
    kind: 'all',
    feed: [],
    collections: feed.collections,
    categories: feed.categories,
    protocols: feed.protocols,
    chain: feed.chain,
    filter: base.filter ?? null,
    address: base.address ?? null,
    detail: base.detail,
    related: base.related || [],
    chat: base.chat ?? null,
  };
  return { view, shell };
}

/**
 * Canonical URL for a feed-style page: the path plus only the parameters that
 * change the content (non-default sort, explicit kind, a valid cursor), in a
 * fixed order. Page one is the bare path; every cursor page is its own page.
 */
function feedCanonical(origin: string, route: 'feed' | 'c' | 'a' | 'p' | 'tick' | 'block' | 'cat', view: FeedView): string {
  const q: string[] = [];
  if (view.sort !== FV.defaultSort(route)) q.push(`sort=${view.sort}`);
  if (view.kind === 'all' && route !== 'a' && route !== 'p' && route !== 'tick' && route !== 'block') q.push('kind=all');
  if (view.before) q.push(`before=${encodeURIComponent(view.before)}`);
  return origin + view.pathname + (q.length ? '?' + q.join('&') : '');
}

/** The client's loadRelated(): the message's collection if it has one, else its address; newest 6, minus itself, keep 5. */
async function relatedFor(d1: D1Database, msg: import('./types').Message): Promise<import('./types').Message[]> {
  const res = await db
    .getMessages(d1, msg.collection_id ? { collectionId: msg.collection_id, kind: 'all', sort: 'new', limit: 6 } : { address: msg.address, kind: 'all', sort: 'new', limit: 6 })
    .catch(() => ({ messages: [] as import('./types').Message[] }));
  return res.messages.filter((x) => x.txid !== msg.txid).slice(0, 5);
}

// ---------------------------------------------------------------------------
// Search Engine & Generative AI Discovery Directives
// ---------------------------------------------------------------------------

app.get('/robots.txt', (c) => {
  const origin = originOf(c);
  return new Response(generateRobotsTxt(origin), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
    },
  });
});

app.get('/llms.txt', (c) => {
  const origin = originOf(c);
  return new Response(generateLlmsTxt(origin, listGuides().map((g) => ({ slug: g.meta.slug, title: g.meta.title, description: g.meta.description }))), {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'cache-control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
    },
  });
});

app.get('/llms-full.txt', async (c) => {
  const origin = originOf(c);
  const [cols, addrs] = await Promise.all([
    db.listCollections(c.env.DB).catch(() => []),
    db.listAddresses(c.env.DB).catch(() => []),
  ]);
  const finalCols = cols.length ? cols : (seedCollections as unknown as CollectionWithStats[]);
  return new Response(generateLlmsFullTxt(origin, finalCols, addrs), {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'cache-control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
    },
  });
});

const SITEMAP_HEADERS = {
  'content-type': 'application/xml; charset=utf-8',
  'cache-control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
};

/**
 * /sitemap.xml is an index: the pages file plus one file per month of human
 * messages, so every human message page has a crawl path regardless of how
 * deep it sits in a feed. Each file is a ten-minute edge-cached snapshot.
 */
app.get('/sitemap.xml', async (c) => {
  const origin = originOf(c);
  const xml = await cachedValue<string>(origin, 'sitemap:3:index', 600, async () => {
    const months = await db.humanMessageMonths(c.env.DB).catch(() => []);
    return generateSitemapIndexXml(origin, months);
  });
  return new Response(xml, { headers: SITEMAP_HEADERS });
});

// A full path segment with a brace-free pattern: Hono ends a param's regex at the first "}".
app.get('/sitemap-messages/:file{[0-9][0-9][0-9][0-9]-[0-9][0-9]\\.xml}', async (c) => {
  const origin = originOf(c);
  const month = (c.req.param('file') ?? '').slice(0, 7);
  const xml = await cachedValue<string>(origin, `sitemap:3:m:${month}`, 600, async () =>
    generateMessagesSitemapXml(origin, await db.humanMessagesInMonth(c.env.DB, month).catch(() => []))
  );
  return new Response(xml, { headers: SITEMAP_HEADERS });
});

app.get('/sitemap-pages.xml', async (c) => {
  const origin = originOf(c);
  // The aggregations behind the lastmod dates run once per TTL, not per request.
  const xml = await cachedValue<string>(origin, 'sitemap:3:pages', 600, async () => {
    const [cols, addrs, protocols, ticks, categories, activity] = await Promise.all([
      db.listCollections(c.env.DB).catch(() => []),
      db.listAddresses(c.env.DB).catch(() => []),
      db.listProtocols(c.env.DB).catch(() => []),
      db.listTicks(c.env.DB, undefined, 0, 200).catch(() => []),
      db.listCategories(c.env.DB).catch(() => []),
      db.monitoredActivity(c.env.DB).catch(() => new Map<string, number>()),
    ]);
    const finalCols = cols.length ? cols : (seedCollections as unknown as CollectionWithStats[]);
    return generateSitemapXml(origin, finalCols, addrs, [], protocols, ticks, listGuides().map((g) => ({ slug: g.meta.slug, updated: g.meta.updated })), {
      categories,
      addressActivity: activity,
    });
  });
  return new Response(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
});

// ---------------------------------------------------------------------------
// Markdown for Agents & Discovery Helpers
// ---------------------------------------------------------------------------

function wantsMarkdown(c: Context): boolean {
  const accept = c.req.header('accept') || '';
  return accept.includes('text/markdown');
}

function linkHeaders(origin: string): string {
  return [
    `<${origin}/.well-known/api-catalog>; rel="api-catalog"`,
    `<${origin}/api/openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json;version=3.0"`,
    `<${origin}/guide>; rel="service-doc"`,
    `<${origin}/.well-known/agent-card.json>; rel="describedby"; type="application/json"`,
    `<${origin}/auth.md>; rel="authorizationserver"`,
  ].join(', ');
}

function applyDiscoveryHeaders(c: Context, origin: string): void {
  c.header('Link', linkHeaders(origin));
  c.header('Content-Signal', 'search=yes, ai-train=yes, ai-input=yes');
  c.header('Vary', 'Accept');
}

function markdownResponse(
  content: string,
  origin: string,
  cacheControl = 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400'
): Response {
  return new Response(content, {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'cache-control': cacheControl,
      'Link': linkHeaders(origin),
      'Content-Signal': 'search=yes, ai-train=yes, ai-input=yes',
      'Vary': 'Accept',
    },
  });
}

// ---------------------------------------------------------------------------
// RFC 9727 API Catalog & OpenAPI
// ---------------------------------------------------------------------------

app.get('/.well-known/api-catalog', (c) => {
  const origin = originOf(c);
  return new Response(JSON.stringify(generateApiCatalogJson(origin), null, 2), {
    headers: {
      'content-type': 'application/linkset+json; charset=utf-8',
      'cache-control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
      'access-control-allow-origin': '*',
    },
  });
});

app.get('/api/openapi.json', (c) => {
  const origin = originOf(c);
  return new Response(JSON.stringify(generateOpenApiJson(origin), null, 2), {
    headers: {
      'content-type': 'application/vnd.oai.openapi+json;version=3.0; charset=utf-8',
      'cache-control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
      'access-control-allow-origin': '*',
    },
  });
});

// ---------------------------------------------------------------------------
// Agent Auth & Discovery (RFC 9728, RFC 8414, Auth.md)
// ---------------------------------------------------------------------------

app.use('*', async (c, next) => {
  const p = c.req.path;
  if (p.startsWith('/.well-known/oauth-protected-resource')) {
    const origin = originOf(c);
    return new Response(JSON.stringify(generateOAuthProtectedResourceJson(origin), null, 2), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=300',
        'access-control-allow-origin': '*',
      },
    });
  }
  if (p.startsWith('/.well-known/oauth-authorization-server') || p.startsWith('/.well-known/openid-configuration')) {
    const origin = originOf(c);
    return new Response(JSON.stringify(generateOAuthServerJson(origin), null, 2), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=300',
        'access-control-allow-origin': '*',
      },
    });
  }
  if (p === '/auth.md' || p.startsWith('/auth.md')) {
    const origin = originOf(c);
    return new Response(generateAuthMd(origin), {
      headers: {
        'content-type': 'text/markdown; charset=utf-8',
        'cache-control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=300',
        'access-control-allow-origin': '*',
      },
    });
  }
  await next();
});

const handleOAuthProtected = (c: Context<Bindings>) => {
  const origin = originOf(c);
  return new Response(JSON.stringify(generateOAuthProtectedResourceJson(origin), null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=300',
      'access-control-allow-origin': '*',
    },
  });
};

app.get('/.well-known/oauth-protected-resource', handleOAuthProtected);

const handleOAuthServer = (c: Context<Bindings>) => {
  const origin = originOf(c);
  return new Response(JSON.stringify(generateOAuthServerJson(origin), null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=300',
      'access-control-allow-origin': '*',
    },
  });
};

app.get('/.well-known/oauth-authorization-server', handleOAuthServer);
app.get('/.well-known/openid-configuration', handleOAuthServer);

app.get('/.well-known/jwks.json', () => {
  return new Response(JSON.stringify({ keys: [] }, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
      'access-control-allow-origin': '*',
    },
  });
});

// ---------------------------------------------------------------------------
// OAuth Agent Endpoints (safe public / anonymous handlers for discovery)
// ---------------------------------------------------------------------------

app.all('/oauth/register', (c) => {
  const origin = originOf(c);
  return c.json({
    client_id: 'anonymous-agent',
    client_name: 'The Permanent Record Anonymous Agent',
    scope: 'read:messages read:collections',
    grant_types_supported: ['anonymous', 'client_credentials'],
    token_endpoint: `${origin}/oauth/token`,
  }, 200, { 'access-control-allow-origin': '*' });
});

app.all('/oauth/token', (c) => {
  return c.json({
    access_token: 'opreturn_anonymous_read_token',
    token_type: 'Bearer',
    expires_in: 86400,
    scope: 'read:messages read:collections',
  }, 200, { 'access-control-allow-origin': '*' });
});

app.all('/oauth/revoke', (c) => {
  return c.json({ ok: true, status: 'revoked' }, 200, { 'access-control-allow-origin': '*' });
});

app.all('/oauth/claim', (c) => {
  return c.json({ ok: true, status: 'verified' }, 200, { 'access-control-allow-origin': '*' });
});

app.all('/oauth/authorize', (c) => {
  const origin = originOf(c);
  return c.redirect(`${origin}/`);
});

// ---------------------------------------------------------------------------
// Agent-to-Agent (A2A) & Model Context Protocol (MCP - SEP-1649)
// ---------------------------------------------------------------------------

app.get('/.well-known/agent-card.json', (c) => {
  const origin = originOf(c);
  return new Response(JSON.stringify(generateAgentCardJson(origin), null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
      'access-control-allow-origin': '*',
    },
  });
});

app.get('/.well-known/mcp/server-card.json', (c) => {
  const origin = originOf(c);
  return new Response(JSON.stringify(generateMcpServerCardJson(origin), null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
      'access-control-allow-origin': '*',
    },
  });
});

const handleAgentSkills = (c: Context<Bindings>) => {
  const origin = originOf(c);
  return new Response(JSON.stringify(generateAgentSkillsIndexJson(origin), null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=300',
      'access-control-allow-origin': '*',
    },
  });
};

app.get('/.well-known/agent-skills/index.json', handleAgentSkills);
app.get('/.well-known/skills/index.json', handleAgentSkills);

app.get('/.well-known/agent-skills/:skill/SKILL.md', (c) => {
  const origin = originOf(c);
  const skill = c.req.param('skill');
  return new Response(generateSkillMd(skill, origin), {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'cache-control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=300',
      'access-control-allow-origin': '*',
    },
  });
});

// MCP Endpoint: Info and JSON-RPC 2.0 tool execution
app.all('/mcp', async (c) => {
  if (c.req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'content-type, authorization',
      },
    });
  }

  const origin = originOf(c);
  const card = generateMcpServerCardJson(origin);

  c.header('access-control-allow-origin', '*');

  if (c.req.method === 'GET') {
    return c.json(card);
  }

  if (c.req.method === 'POST') {
    let body: any = {};
    try {
      body = await c.req.json();
    } catch {
      return jsonError('Invalid JSON body', 400);
    }

    const { id, method, params } = body;
    if (method === 'initialize') {
      return c.json({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: card.capabilities,
          serverInfo: card.serverInfo,
        },
      });
    }

    if (method === 'tools/list') {
      return c.json({
        jsonrpc: '2.0',
        id,
        result: { tools: card.tools },
      });
    }

    if (method === 'tools/call') {
      const toolName = params?.name;
      const args = params?.arguments || {};

      if (toolName === 'get_collections') {
        const cols = await db.listCollections(c.env.DB).catch(() => []);
        return c.json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(cols, null, 2) }],
          },
        });
      }

      if (toolName === 'search_messages') {
        const protocol = slugParam(args.protocol ? String(args.protocol) : undefined);
        const tick = tickParam(args.tick ? String(args.tick) : undefined);
        const res = await db.getMessages(c.env.DB, {
          collectionId: args.collection_id ? Number(args.collection_id) : undefined,
          address: args.address ? String(args.address) : undefined,
          category: args.category ? String(args.category) : undefined,
          protocol,
          tick,
          kind: args.kind === 'all' || protocol || tick || args.collection_id || args.address ? 'all' : 'text',
          sort: args.sort === 'new' ? 'new' : 'hot',
          limit: Math.min(Number(args.limit) || 20, 100),
        }).catch(() => ({ messages: [] }));
        return c.json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(res, null, 2) }],
          },
        });
      }

      if (toolName === 'get_message') {
        const key = String(args.key || '');
        const msg = await db.getMessageByTxid(c.env.DB, key).catch(() => null);
        return c.json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: msg ? JSON.stringify(msg, null, 2) : 'Message not found' }],
            isError: !msg,
          },
        });
      }

      if (toolName === 'get_protocols') {
        const [protocols, ticks, chain] = await Promise.all([
          db.listProtocols(c.env.DB).catch(() => []),
          db.listTicks(c.env.DB, undefined, 0, 50).catch(() => []),
          db.getChainStats(c.env.DB).catch(() => null),
        ]);
        return c.json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify({ protocols, ticks, chain }, null, 2) }],
          },
        });
      }

      if (toolName === 'get_block') {
        const height = Number(args.height);
        const block = Number.isInteger(height) ? await db.getBlock(c.env.DB, height).catch(() => null) : null;
        const msgs = block
          ? await db.getMessages(c.env.DB, { sort: 'new', limit: 100, kind: 'all', blockHeight: height }).catch(() => ({ messages: [] }))
          : { messages: [] };
        return c.json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: block ? JSON.stringify({ block, messages: msgs.messages }, null, 2) : 'Block not scanned' }],
            isError: !block,
          },
        });
      }

      if (toolName === 'list_guides') {
        const guides = listGuides().map((g) => ({ slug: g.meta.slug, title: g.meta.title, description: g.meta.description, updated: g.meta.updated, url: `${origin}/learn/${g.meta.slug}` }));
        return c.json({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(guides, null, 2) }] } });
      }

      if (toolName === 'get_guide') {
        const doc = getGuide(String(args.slug || ''));
        if (!doc) return c.json({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'Guide not found' }], isError: true } });
        const g = renderGuide(doc, await loadFacts(c.env.DB));
        return c.json({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: g.markdown }] } });
      }

      if (toolName === 'get_etch_guide') {
        const guide = renderGuideMarkdown(origin);
        return c.json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: guide }],
          },
        });
      }

      return c.json({
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Tool '${toolName}' not found` },
      });
    }

    return c.json({
      jsonrpc: '2.0',
      id,
      result: { ok: true, server: card.serverInfo },
    });
  }

  return jsonError('Method Not Allowed', 405);
});

// ---------------------------------------------------------------------------
// Public Content Pages (SSR + SEO + Structured Data Graph + Agent Markdown)
// ---------------------------------------------------------------------------

app.get('/', async (c) => {
  const origin = originOf(c);
  if (wantsMarkdown(c)) {
    // Agents get the short form without paying for the landing's seven queries.
    const [cols, addrs, feedRes] = await Promise.all([
      db.listCollections(c.env.DB).catch(() => []),
      db.listAddresses(c.env.DB).catch(() => []),
      db.getMessages(c.env.DB, { sort: 'hot', limit: 1, kind: 'text' }).catch(() => ({ messages: [] })),
    ]);
    const feat = feedRes.messages[0] || null;
    const cmap = new Map(cols.map((col) => [col.id, col.name]));
    return markdownResponse(
      renderLandingMarkdown(
        origin,
        cols.length || seedCollections.length,
        addrs.length || seedCollections.reduce((sum, col) => sum + (col.addresses?.length || 0), 0),
        feat,
        feat?.collection_id ? cmap.get(feat.collection_id) : undefined
      ),
      origin
    );
  }
  const [cols, addrs, feedRes, liveRes, chain, protocols, categories] = await Promise.all([
    db.listCollections(c.env.DB).catch(() => []),
    db.listAddresses(c.env.DB).catch(() => []),
    db.getMessages(c.env.DB, { sort: 'hot', limit: 1, kind: 'text' }).catch(() => ({ messages: [] })),
    db.getMessages(c.env.DB, { sort: 'new', limit: 4, kind: 'text' }).catch(() => ({ messages: [] })),
    db.getChainStats(c.env.DB).catch(() => null),
    db.listProtocols(c.env.DB).catch(() => []),
    db.listCategories(c.env.DB).catch(() => []),
  ]);
  const colsCount = cols.length || seedCollections.length;
  const addrsCount =
    addrs.length ||
    seedCollections.reduce((sum, col) => sum + (col.addresses?.length || 0), 0);
  const feat = feedRes.messages[0] || null;
  const cmap = new Map(cols.map((col) => [col.id, col.name]));
  const colName = feat?.collection_id ? cmap.get(feat.collection_id) : undefined;

  applyDiscoveryHeaders(c, origin);
  const graph = [...buildWebSiteGraph(origin), buildFaqSchema()];
  const initialHtml = renderLandingSsr({
    collectionsCount: colsCount,
    addressesCount: addrsCount,
    messagesCount: cols.reduce((t, col) => t + (col.message_count || 0), 0),
    featured: feat,
    colName,
    live: liveRes.messages,
    chain,
    protocolsCount: protocols.length,
    categories,
  });

  return c.html(
    renderIndex({
      title: 'The Permanent Record \u2014 messages inside Bitcoin',
      description:
        'People are leaving messages inside Bitcoin. Forever. Threats, confessions, prayers, ads, haiku \u2014 archived live from the chain.',
      url: origin + '/',
      image: origin + '/og/default.png',
      jsonLd: { '@context': 'https://schema.org', '@graph': graph },
      initialHtml,
    }, await shellFor(c))
  );
});

app.get('/feed', async (c) => {
  const origin = originOf(c);
  if (wantsMarkdown(c)) {
    return markdownResponse(renderFeedMarkdown(origin), origin);
  }
  const { view, shell } = await feedViewFor(c, 'feed', {});
  applyDiscoveryHeaders(c, origin);
  const crumbs = buildBreadcrumbSchema(origin, [
    { name: 'Home', path: '/' },
    { name: 'Transmissions', path: '/feed' },
  ]);
  return c.html(
    renderIndex({
      title: 'All transmissions \u2014 The Permanent Record',
      description: 'Every monitored OP_RETURN message, live from the Bitcoin chain.',
      url: origin + '/feed',
      image: origin + '/og/default.png',
      jsonLd: crumbs,
      feedView: view,
      canonical: feedCanonical(origin, 'feed', view),
      ...(view.q ? { noindex: true } : {}),
      initialHtml: renderFeedPage(view),
    }, shell)
  );
});

app.get('/collections', async (c) => {
  const origin = originOf(c);
  const cols = await db.listCollections(c.env.DB).catch(() => []);
  const finalCols = cols.length ? cols : (seedCollections as unknown as CollectionWithStats[]);
  if (wantsMarkdown(c)) {
    return markdownResponse(renderCollectionsMarkdown(origin, finalCols), origin);
  }
  applyDiscoveryHeaders(c, origin);
  const crumbs = buildBreadcrumbSchema(origin, [
    { name: 'Home', path: '/' },
    { name: 'Collections', path: '/collections' },
  ]);
  return c.html(
    renderIndex({
      title: 'Collections \u2014 The Permanent Record',
      description: 'Addresses grouped by the phenomenon behind them.',
      url: origin + '/collections',
      image: origin + '/og/default.png',
      jsonLd: crumbs,
      initialHtml: renderCollectionsSsr(finalCols),
    }, await shellFor(c))
  );
});

// ---------------------------------------------------------------------------
// Learn: long-form guides (content/learn/*.md), server-rendered with live facts
// ---------------------------------------------------------------------------

app.get('/learn', async (c) => {
  const origin = originOf(c);
  const guides = listGuides().map((doc) => ({ doc, minutes: guideMinutes(doc.meta.slug) }));
  if (wantsMarkdown(c)) {
    return markdownResponse(
      `# Learn — guides to Bitcoin's OP_RETURN messages\n\n${guides.map(({ doc }) => `- [${doc.meta.title}](${origin}/learn/${doc.meta.slug}) — ${doc.meta.description}`).join('\n')}\n`,
      origin
    );
  }
  const body = renderLearnIndexHtml(guides);
  if (c.req.query('partial') === '1') return partialResponse(body, `${origin}/learn`);
  applyDiscoveryHeaders(c, origin);
  const crumbs = buildBreadcrumbSchema(origin, [
    { name: 'Home', path: '/' },
    { name: 'Learn', path: '/learn' },
  ]);
  return c.html(
    renderIndex({
      title: 'Learn \u2014 guides to Bitcoin OP_RETURN messages',
      description: 'Plain-language guides written from the archive: what OP_RETURN is, Bitcoin Core 30 policy, how to read incident boards, how to etch a message, and how to use the API.',
      url: origin + '/learn',
      image: origin + '/og/default.png',
      jsonLd: crumbs,
      initialHtml: body,
    }, await shellFor(c))
  );
});

app.get('/learn/:slug', async (c) => {
  const origin = originOf(c);
  const slug = c.req.param('slug');
  const doc = getGuide(slug);
  if (!doc) {
    if (wantsMarkdown(c)) {
      return new Response(`# Guide Not Found\n\nNo guide named "${slug}".`, { status: 404, headers: { 'content-type': 'text/markdown; charset=utf-8', Vary: 'Accept' } });
    }
    return c.html(
      renderIndex({
        title: 'Guide not found \u2014 The Permanent Record',
        description: 'This guide does not exist.',
        url: `${origin}/learn/${slug}`,
        image: `${origin}/og/default.png`,
        noindex: true,
        initialHtml: renderNotFoundSsr('Guide not found', `There is no guide named \u201c${slug}\u201d.`),
      }, await shellFor(c)),
      404
    );
  }
  const g = renderGuide(doc, await loadFacts(c.env.DB));
  if (wantsMarkdown(c)) return markdownResponse(g.markdown, origin);
  const related = doc.meta.related.map((s) => getGuide(s)).filter((x): x is NonNullable<typeof x> => Boolean(x));
  const jsonLd = { '@context': 'https://schema.org', '@graph': guideJsonLd(origin, g) };
  const body = renderGuideHtml(g, related).replace('<main class="page article"', `<main class="page article" data-title="${escHtml(doc.meta.title + ' \u2014 The Permanent Record')}" data-description="${escHtml(doc.meta.description)}"`);
  if (c.req.query('partial') === '1') {
    // The fragment carries its structured data so client-side navigation can swap it into <head>.
    return partialResponse(body + `<script type="application/ld+json" data-learn-jsonld>${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`, `${origin}/learn/${slug}`);
  }
  applyDiscoveryHeaders(c, origin);
  return c.html(
    renderIndex({
      title: `${doc.meta.title} \u2014 The Permanent Record`,
      description: doc.meta.description,
      url: `${origin}/learn/${slug}`,
      image: `${origin}/og/default.png`,
      type: 'article',
      jsonLd,
      initialHtml: body,
    }, await shellFor(c))
  );
});

/** Fragment for client-side navigation: never indexable, canonical to the full page. */
function partialResponse(html: string, canonical: string): Response {
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'x-robots-tag': 'noindex',
      link: `<${canonical}>; rel="canonical"`,
      'cache-control': 'public, max-age=60',
      vary: 'Accept',
    },
  });
}

app.get('/rooms', async (c) => {
  const origin = originOf(c);
  const cols = await db.listCollections(c.env.DB).catch(() => []);
  let best: (typeof cols)[number] | undefined;
  for (const col of cols) if (!best || (col.message_count || 0) > (best.message_count || 0)) best = col;
  if (wantsMarkdown(c)) {
    return markdownResponse(
      `# Chat rooms\n\nEvery collection is also a chat room: the on-chain conversation between monitored addresses and everyone writing to them.\n\n${cols.map((col) => `- [${col.name}](${origin}/c/${col.slug || col.id}/chat) (${col.message_count} messages)`).join('\n')}\n`,
      origin
    );
  }
  // The client opens the room of the first collection with the highest message count, in list order.
  const chat = best ? await db.getChat(c.env.DB, { collectionId: best.id, limit: 200 }).catch(() => null) : null;
  const { view, shell } = await pageViewFor(c, { filter: best ? best.id : null, chat: chat ? { messages: chat.messages as unknown as FeedView['feed'], participants: chat.participants, nextBefore: chat.next_before } : null });
  applyDiscoveryHeaders(c, origin);
  const crumbs = buildBreadcrumbSchema(origin, [
    { name: 'Home', path: '/' },
    { name: 'Chat rooms', path: '/rooms' },
  ]);
  return c.html(
    renderIndex({
      title: 'Chat rooms \u2014 The Permanent Record',
      description: 'Every collection is a chat room: the on-chain OP_RETURN conversation between monitored addresses and everyone writing to them.',
      url: origin + '/rooms',
      image: origin + '/og/default.png',
      jsonLd: crumbs,
      initialHtml: renderChatPage(view),
    }, shell)
  );
});

app.get('/protocols', async (c) => {
  const origin = originOf(c);
  const [protocols, ticks, chain] = await Promise.all([
    db.listProtocols(c.env.DB).catch(() => []),
    db.listTicks(c.env.DB, undefined, 0, 40).catch(() => []),
    db.getChainStats(c.env.DB).catch(() => null),
  ]);
  if (wantsMarkdown(c)) return markdownResponse(renderProtocolsMarkdown(origin, protocols, ticks), origin);
  applyDiscoveryHeaders(c, origin);
  const crumbs = buildBreadcrumbSchema(origin, [
    { name: 'Home', path: '/' },
    { name: 'Protocols', path: '/protocols' },
  ]);
  return c.html(
    renderIndex({
      title: 'OP_RETURN protocols \u2014 The Permanent Record',
      description: `${protocols.filter((p) => p.protocol !== 'text').length} protocols decoded from every Bitcoin block: token ops, bridges, sidechain tags and more.`,
      url: origin + '/protocols',
      image: origin + '/og/default.png',
      jsonLd: crumbs,
      initialHtml: renderProtocolsSsr(protocols, ticks, chain),
    }, await shellFor(c))
  );
});

app.get('/guide', async (c) => {
  const origin = originOf(c);
  if (wantsMarkdown(c)) {
    return markdownResponse(renderGuideMarkdown(origin), origin);
  }
  applyDiscoveryHeaders(c, origin);
  const howTo = buildGuideHowToSchema(origin);
  const crumbs = buildBreadcrumbSchema(origin, [
    { name: 'Home', path: '/' },
    { name: 'Field Manual', path: '/guide' },
  ]);
  return c.html(
    renderIndex({
      title: 'Field Manual \u2014 etch a message onto Bitcoin',
      description: 'How to attach an OP_RETURN output and leave a permanent mark.',
      url: origin + '/guide',
      image: origin + '/og/default.png',
      jsonLd: { '@context': 'https://schema.org', '@graph': [howTo, crumbs] },
      initialHtml: renderGuideSsr(),
    }, await shellFor(c))
  );
});

app.get('/m/:txid', async (c) => {
  const txid = c.req.param('txid')!;
  const msg = await db.getMessageByTxid(c.env.DB, txid);
  const origin = originOf(c);
  if (!msg) {
    if (wantsMarkdown(c)) {
      return new Response('# Message Not Found\n\nTransaction was not found in the monitored archive.', {
        status: 404,
        headers: { 'content-type': 'text/markdown; charset=utf-8', Vary: 'Accept' },
      });
    }
    return c.html(
      renderIndex({
        title: 'Message not found \u2014 The Permanent Record',
        description: 'Transaction was not found in the monitored archive.',
        url: `${origin}/m/${txid}`,
        image: `${origin}/og/default.png`,
        noindex: true,
        initialHtml: renderNotFoundSsr(
          'Message not found',
          `Transaction ${txid} was not found in the monitored archive.`
        ),
      }, await shellFor(c)),
      404
    );
  }
  const cmap = await collectionMap(c.env.DB);
  const colName = msg.collection_id != null ? cmap.get(msg.collection_id)?.name ?? '' : '';

  if (wantsMarkdown(c)) {
    return markdownResponse(renderMessageMarkdown(origin, msg, colName), origin);
  }
  const [related, { view, shell }, usd] = await Promise.all([
    relatedFor(c.env.DB, msg),
    pageViewFor(c, { detail: msg as unknown as FeedView['detail'] }),
    // A cache miss calls the price host; never hold the page for it. On a timeout the span is
    // empty and the client fills it after its own fetch (the one case the row may reflow).
    msg.fee_sats != null ? within(1500, priceUsdAt(c, msg.block_time ?? Math.floor(Date.now() / 1000)), null) : Promise.resolve(null),
  ]);
  view.related = related as unknown as FeedView['feed'];
  view.feeUsd = feeUsdText(msg.fee_sats, usd);

  applyDiscoveryHeaders(c, origin);
  const previewText = messageExcerpt(msg, 2000) || msg.content || 'OP_RETURN';
  const postSchema = buildMessageSchema(origin, { ...msg, content: previewText }, colName);
  const headline = messageHeadline(msg, 64);
  const isProto = Boolean(msg.protocol && msg.protocol !== 'text');
  const when = msg.block_time ? new Date(msg.block_time * 1000).toISOString().slice(0, 10) : 'unconfirmed';
  const crumbs = buildBreadcrumbSchema(origin, [
    { name: 'Home', path: '/' },
    { name: isProto ? protocolLabel(msg.protocol as string) : 'Transmissions', path: isProto ? `/p/${msg.protocol}` : '/feed' },
    { name: clamp(headline, 40), path: `/m/${txid}` },
  ]);
  // Twins of the same message to the same address share one canonical page.
  const rep = msg.is_dup ? await db.getRepresentativeTxid(c.env.DB, msg.id).catch(() => null) : null;
  const descBits = [
    isProto ? `${protocolLabel(msg.protocol as string)} OP_RETURN transaction` : 'Bitcoin OP_RETURN message',
    colName ? `in ${colName}` : `to ${shortAddr(msg.address)}`,
    msg.block_height != null ? `block ${msg.block_height.toLocaleString()}` : when,
    isProto ? messageExcerpt(msg, 90) : `${msg.likes} likes`,
  ];
  return c.html(
    renderIndex({
      title: isProto ? `${headline} \u2014 Bitcoin OP_RETURN` : `${headline} \u2014 OP_RETURN message`,
      description: descBits.filter(Boolean).join(' \u00b7 '),
      url: `${origin}/m/${txid}`,
      canonical: rep && rep !== txid ? `${origin}/m/${rep}` : undefined,
      // Protocol rows (bridge receipts, token ops, hashes) are thin and repetitive: crawlable and linked, not indexed.
      noindex: !previewText.trim() || isProto,
      image: `${origin}/og/message/${txid}.png`,
      type: 'article',
      jsonLd: { '@context': 'https://schema.org', '@graph': [postSchema, crumbs] },
      initialHtml: renderDetailPage(view as FeedView & { detail: NonNullable<FeedView['detail']> }),
    }, shell)
  );
});

app.get('/c/:slug', async (c) => {
  const slug = c.req.param('slug');
  const col = await db.getCollectionBySlug(c.env.DB, slug);
  const origin = originOf(c);
  if (!col) {
    if (wantsMarkdown(c)) {
      return new Response(`# Collection Not Found\n\nCollection "${slug}" was not found in the archive.`, {
        status: 404,
        headers: { 'content-type': 'text/markdown; charset=utf-8', Vary: 'Accept' },
      });
    }
    return c.html(
      renderIndex({
        title: 'Collection not found \u2014 The Permanent Record',
        description: 'This collection was not found in the archive.',
        url: `${origin}/c/${slug}`,
        image: `${origin}/og/default.png`,
        noindex: true,
        initialHtml: renderNotFoundSsr(
          'Collection not found',
          `The collection slug \u201c${slug}\u201d does not exist in the archive.`
        ),
      }, await shellFor(c)),
      404
    );
  }
  const allAddrs = await db.listAddresses(c.env.DB).catch(() => []);
  const colAddrs = allAddrs.filter((a) => a.collection_id === col.id);

  if (wantsMarkdown(c)) {
    return markdownResponse(renderCollectionMarkdown(origin, col, colAddrs), origin);
  }
  const { view, shell } = await feedViewFor(c, 'c', { filter: col.id, extraHtml: renderCollectionExtras(col, colAddrs) });

  applyDiscoveryHeaders(c, origin);
  const colSchema = buildCollectionSchema(origin, col);
  const crumbs = buildBreadcrumbSchema(origin, [
    { name: 'Home', path: '/' },
    { name: 'Collections', path: '/collections' },
    { name: col.name, path: `/c/${slug}` },
  ]);

  return c.html(
    renderIndex({
      title: col.name,
      description: `${clamp(col.description || 'Addresses monitored on-chain.', 120)} \u00b7 ${col.address_count} addresses \u00b7 ${col.message_count} messages`,
      url: `${origin}/c/${slug}`,
      image: `${origin}/og/collection/${slug}.png`,
      jsonLd: { '@context': 'https://schema.org', '@graph': [colSchema, crumbs] },
      feedView: view,
      canonical: feedCanonical(origin, 'c', view),
      ...(view.q ? { noindex: true } : {}),
      initialHtml: renderFeedPage(view),
    }, shell)
  );
});

app.get('/c/:slug/chat', async (c) => {
  const slug = c.req.param('slug');
  const col = await db.getCollectionBySlug(c.env.DB, slug);
  const origin = originOf(c);
  if (!col) {
    if (wantsMarkdown(c)) {
      return new Response(`# Collection Not Found\n\nCollection "${slug}" was not found in the archive.`, {
        status: 404,
        headers: { 'content-type': 'text/markdown; charset=utf-8', Vary: 'Accept' },
      });
    }
    return c.html(
      renderIndex({
        title: 'Collection not found \u2014 The Permanent Record',
        description: 'This collection was not found in the archive.',
        url: `${origin}/c/${slug}/chat`,
        image: `${origin}/og/default.png`,
        noindex: true,
        initialHtml: renderNotFoundSsr(
          'Collection not found',
          `The collection slug \u201c${slug}\u201d does not exist in the archive.`
        ),
      }, await shellFor(c)),
      404
    );
  }
  if (wantsMarkdown(c)) {
    return markdownResponse(
      `# ${col.name} — Chat Room\n\n${col.description || ''}\n\n* Messages: ${col.message_count}\n* Addresses: ${col.address_count}\n* Chat API: ${origin}/api/chat?collection_id=${col.id}\n`,
      origin
    );
  }
  const chat = await db.getChat(c.env.DB, { collectionId: col.id, limit: 200 }).catch(() => null);
  const { view, shell } = await pageViewFor(c, { filter: col.id, chat: chat ? { messages: chat.messages as unknown as FeedView['feed'], participants: chat.participants, nextBefore: chat.next_before } : null });
  applyDiscoveryHeaders(c, origin);
  const crumbs = buildBreadcrumbSchema(origin, [
    { name: 'Home', path: '/' },
    { name: 'Collections', path: '/collections' },
    { name: col.name, path: `/c/${slug}` },
    { name: 'Chat Room', path: `/c/${slug}/chat` },
  ]);
  return c.html(
    renderIndex({
      title: `${col.name} \u2014 chat room`,
      description: `The whole on-chain conversation, oldest to newest: ${col.message_count} OP_RETURN messages between ${col.address_count} monitored addresses and everyone writing to them.`,
      url: `${origin}/c/${slug}/chat`,
      image: `${origin}/og/chat/collection/${slug}.png`,
      jsonLd: crumbs,
      initialHtml: renderChatPage(view),
    }, shell)
  );
});


app.get('/a/:address', async (c) => {
  const address = c.req.param('address');
  const origin = originOf(c);
  if (wantsMarkdown(c)) {
    return markdownResponse(renderAddressMarkdown(origin, address), origin);
  }
  const [{ view, shell }, addrs] = await Promise.all([feedViewFor(c, 'a', { address }), db.listAddresses(c.env.DB).catch(() => [])]);
  const monitored = addrs.find((a) => a.address === address);
  const indexable = addressIndexable(Boolean(monitored), view.feed.length);
  applyDiscoveryHeaders(c, origin);
  const crumbs = buildBreadcrumbSchema(origin, [
    { name: 'Home', path: '/' },
    { name: 'Address Record', path: `/a/${address}` },
  ]);
  return c.html(
    renderIndex({
      title: monitored?.label ? `${monitored.label} \u2014 ${shortAddr(address)} OP_RETURN record` : `Address record \u2014 ${address}`,
      description: `${view.feed.length ? view.feed.length + '+' : 'Every'} archived OP_RETURN message${monitored?.label ? ' involving ' + monitored.label : ''} sent to or from ${address}.`,
      url: `${origin}/a/${address}`,
      image: `${origin}/og/address/${encodeURIComponent(address)}.png`,
      noindex: !indexable,
      jsonLd: crumbs,
      feedView: view,
      canonical: feedCanonical(origin, 'a', view),
      ...(view.q ? { noindex: true } : {}),
      initialHtml: renderFeedPage(view),
    }, shell)
  );
});

app.get('/a/:address/chat', async (c) => {
  const address = c.req.param('address');
  const origin = originOf(c);
  if (wantsMarkdown(c)) {
    return markdownResponse(
      `# Chat Room: ${address}\n\nOn-chain communications involving ${address}.\n\n* Chat API: ${origin}/api/chat?address=${encodeURIComponent(address)}\n`,
      origin
    );
  }
  const [chat, addrs, feedRows] = await Promise.all([
    db.getChat(c.env.DB, { address, limit: 200 }).catch(() => null),
    db.listAddresses(c.env.DB).catch(() => []),
    // The same window the address feed page judges by.
    db.getMessages(c.env.DB, { address, kind: 'all', sort: 'new', limit: 3 }).then((r) => r.messages.length).catch(() => 0),
  ]);
  const indexable = addressIndexable(addrs.some((a) => a.address === address), feedRows);
  const { view, shell } = await pageViewFor(c, { address, chat: chat ? { messages: chat.messages as unknown as FeedView['feed'], participants: chat.participants, nextBefore: chat.next_before } : null });
  applyDiscoveryHeaders(c, origin);
  const crumbs = buildBreadcrumbSchema(origin, [
    { name: 'Home', path: '/' },
    { name: address, path: `/a/${address}` },
    { name: 'Chat Room', path: `/a/${address}/chat` },
  ]);
  return c.html(
    renderIndex({
      title: `Chat room \u2014 ${address}`,
      description: `The whole on-chain conversation around ${address}, oldest to newest.`,
      url: `${origin}/a/${address}/chat`,
      image: `${origin}/og/chat/address/${encodeURIComponent(address)}.png`,
      noindex: !indexable,
      jsonLd: crumbs,
      initialHtml: renderChatPage(view),
    }, shell)
  );
});

app.get('/p/:protocol', async (c) => {
  const protocol = slugParam(c.req.param('protocol'));
  const origin = originOf(c);
  if (!protocol) return c.notFound();
  const label = protocolLabel(protocol);
  const stats = await db.listProtocols(c.env.DB).catch(() => []);
  const count = stats.find((s) => s.protocol === protocol)?.count ?? 0;
  if (wantsMarkdown(c)) return markdownResponse(renderProtocolMarkdown(origin, protocol, label, count), origin);
  // The client loads this protocol's top 40 tickers for the head; same query, same limit.
  const ticks = await cachedValue<Awaited<ReturnType<typeof db.listTicks>>>(origin, `ticks:1:0:${protocol}:40`, 300, () => db.listTicks(c.env.DB, protocol, 0, 40)).catch(() => []);
  const { view, shell } = await feedViewFor(c, 'p', { protocol, ticks });
  applyDiscoveryHeaders(c, origin);
  const crumbs = buildBreadcrumbSchema(origin, [
    { name: 'Home', path: '/' },
    { name: 'Protocols', path: '/feed?kind=all' },
    { name: label, path: `/p/${protocol}` },
  ]);
  return c.html(
    renderIndex({
      title: `${label} OP_RETURN transactions \u2014 The Permanent Record`,
      description: `${count} Bitcoin transactions carrying ${label} (${protocol}) OP_RETURN outputs, decoded from every scanned block.`,
      url: `${origin}/p/${protocol}`,
      image: `${origin}/og/protocol/${protocol}.png`,
      jsonLd: crumbs,
      noindex: count === 0,
      feedView: view,
      canonical: feedCanonical(origin, 'p', view),
      ...(view.q ? { noindex: true } : {}),
      initialHtml: renderFeedPage(view),
    }, shell)
  );
});

app.get('/tick/:tick', async (c) => {
  const tick = tickParam(c.req.param('tick'));
  const origin = originOf(c);
  if (!tick) return c.notFound();
  const stats = await db.listTicks(c.env.DB, undefined, 0, 500).catch(() => []);
  const mine = stats.filter((s) => s.tick === tick);
  const count = mine.reduce((n, s) => n + s.count, 0);
  const protocols = mine.map((s) => s.protocol);
  if (wantsMarkdown(c)) return markdownResponse(renderTickMarkdown(origin, tick, count), origin);
  // The client's tick head reads the same top-40 ticker list it loads for /protocols.
  const top = await cachedValue<Awaited<ReturnType<typeof db.listTicks>>>(origin, 'ticks:1:0::40', 300, () => db.listTicks(c.env.DB, undefined, 0, 40)).catch(() => []);
  const { view, shell } = await feedViewFor(c, 'tick', { tick, ticks: top });
  applyDiscoveryHeaders(c, origin);
  const crumbs = buildBreadcrumbSchema(origin, [
    { name: 'Home', path: '/' },
    { name: 'Tickers', path: '/feed?kind=all' },
    { name: `$${tick}`, path: `/tick/${encodeURIComponent(tick)}` },
  ]);
  return c.html(
    renderIndex({
      title: `$${tick} on Bitcoin OP_RETURN \u2014 The Permanent Record`,
      description: `${count} ${tick} token operations${protocols.length ? ' via ' + protocols.join(', ') : ''}, decoded from every scanned Bitcoin block.`,
      url: `${origin}/tick/${encodeURIComponent(tick)}`,
      image: `${origin}/og/tick/${encodeURIComponent(tick)}.png`,
      jsonLd: crumbs,
      noindex: count === 0,
      feedView: view,
      canonical: feedCanonical(origin, 'tick', view),
      ...(view.q ? { noindex: true } : {}),
      initialHtml: renderFeedPage(view),
    }, shell)
  );
});

app.get('/block/:height', async (c) => {
  const height = Number(c.req.param('height'));
  const origin = originOf(c);
  const block = Number.isInteger(height) && height > 0 ? await db.getBlock(c.env.DB, height).catch(() => null) : null;
  if (!block) {
    if (wantsMarkdown(c)) {
      return new Response(`# Block Not Scanned\n\nBlock ${height} has not been scanned by the explorer yet.`, {
        status: 404,
        headers: { 'content-type': 'text/markdown; charset=utf-8', Vary: 'Accept' },
      });
    }
    return c.html(
      renderIndex({
        title: 'Block not scanned \u2014 The Permanent Record',
        description: 'This block has not been scanned yet.',
        url: `${origin}/block/${height}`,
        image: `${origin}/og/default.png`,
        noindex: true,
        initialHtml: renderNotFoundSsr('Block not scanned', `Block ${height} has not been scanned by the explorer yet.`),
      }, await shellFor(c)),
      404
    );
  }
  if (wantsMarkdown(c)) return markdownResponse(renderBlockMarkdown(origin, block), origin);
  const { view, shell } = await feedViewFor(c, 'block', { block: height, blockRow: block });
  applyDiscoveryHeaders(c, origin);
  const crumbs = buildBreadcrumbSchema(origin, [
    { name: 'Home', path: '/' },
    { name: 'Blocks', path: '/feed?kind=all' },
    { name: `Block ${height}`, path: `/block/${height}` },
  ]);
  return c.html(
    renderIndex({
      title: `Block ${height.toLocaleString()} OP_RETURN census \u2014 The Permanent Record`,
      description: `${block.tx_count} transactions, ${block.opreturn_count} OP_RETURN outputs (${block.runes_count} Runes), ${block.stored_count} decoded and archived.`,
      url: `${origin}/block/${height}`,
      image: `${origin}/og/default.png`,
      jsonLd: crumbs,
      feedView: view,
      canonical: feedCanonical(origin, 'block', view),
      ...(view.q ? { noindex: true } : {}),
      initialHtml: renderFeedPage(view),
    }, shell)
  );
});

app.get('/cat/:slug', async (c) => {
  const slug = c.req.param('slug')!;
  const cat = categoryFromSlug(slug);
  const origin = originOf(c);
  if (!cat) {
    if (wantsMarkdown(c)) {
      return new Response(`# Category Not Found\n\nCategory slug "${slug}" does not exist in the taxonomy.`, {
        status: 404,
        headers: { 'content-type': 'text/markdown; charset=utf-8', Vary: 'Accept' },
      });
    }
    return c.html(
      renderIndex({
        title: 'Category not found \u2014 The Permanent Record',
        description: 'Category not found.',
        url: `${origin}/cat/${slug}`,
        image: `${origin}/og/default.png`,
        noindex: true,
        initialHtml: renderNotFoundSsr(
          'Category not found',
          `Category slug \u201c${slug}\u201d does not exist in the taxonomy.`
        ),
      }, await shellFor(c)),
      404
    );
  }
  const stats = await db.listCategories(c.env.DB);
  const count = stats.find((s) => categorySlug(s.category) === slug)?.count ?? 0;

  if (wantsMarkdown(c)) {
    return markdownResponse(renderCategoryMarkdown(origin, cat, count), origin);
  }
  const { view, shell } = await feedViewFor(c, 'cat', { category: cat });

  applyDiscoveryHeaders(c, origin);
  const crumbs = buildBreadcrumbSchema(origin, [
    { name: 'Home', path: '/' },
    { name: 'Categories', path: '/feed' },
    { name: cat, path: `/cat/${slug}` },
  ]);
  return c.html(
    renderIndex({
      title: `${cat} \u2014 The Permanent Record`,
      description: `${count} archived messages classified as ${cat.toLowerCase()}.`,
      url: `${origin}/cat/${slug}`,
      image: `${origin}/og/category/${slug}.png`,
      jsonLd: crumbs,
      feedView: view,
      canonical: feedCanonical(origin, 'cat', view),
      ...(view.q ? { noindex: true } : {}),
      initialHtml: renderFeedPage(view),
    }, shell)
  );
});

// Brand favicon / app icon, served through routes (no static-asset binding).
app.get('/favicon.svg', (c) => {
  c.header('content-type', 'image/svg+xml');
  c.header('cache-control', 'public, max-age=86400');
  return c.body(faviconSvg());
});
app.get('/favicon.png', async () => pngResponse(await iconPng(32)));
app.get('/favicon.ico', async () => pngResponse(await iconPng(32)));
app.get('/apple-touch-icon.png', async () => pngResponse(await iconPng(180)));
app.get('/apple-touch-icon-precomposed.png', async () => pngResponse(await iconPng(180)));
app.get('/icon-512.png', async () => pngResponse(await iconPng(512)));

// OG card images (rasterized on demand). Param captures the full segment
// including ".png" (Hono would otherwise swallow it into the param name).
app.get('/og/default.png', async () => pngResponse(await svgToPng(defaultCardSvg())));

app.get('/og/message/:txid', async (c) => {
  const txid = c.req.param('txid')!.replace(/\.png$/, '');
  const msg = await db.getMessageByTxid(c.env.DB, txid);
  if (!msg) return jsonError('not found', 404);
  const cmap = await collectionMap(c.env.DB);
  const colName = msg.collection_id != null ? cmap.get(msg.collection_id)?.name ?? '' : '';
  return pngResponse(await svgToPng(messageCardSvg(msg, colName)));
});

app.get('/og/collection/:slug', async (c) => {
  const slug = c.req.param('slug')!.replace(/\.png$/, '');
  const col = await db.getCollectionBySlug(c.env.DB, slug);
  if (!col) return jsonError('not found', 404);
  return pngResponse(await svgToPng(collectionCardSvg(col)));
});

/** Labels in collections.json can be long; cards show the part before any parenthesis. */
function shortLabel(label: string | null, fallback: string): string {
  return label ? label.split(' (')[0] : fallback;
}

/**
 * Pick the bubbles for a chat share card: the last two turns by labelled
 * parties plus the newest reply from anyone else, in chain order. Rooms with
 * no party turns fall back to the newest three messages.
 */
async function chatCardData(
  d1: D1Database,
  opts: { collectionId?: number; address?: string },
  title: string,
  messageCount: number
): Promise<ChatCardData> {
  const chat = await db.getChat(d1, { ...opts, limit: 60 });
  const byAddr = new Map(chat.participants.map((p) => [p.address, p.label]));
  const isParty = (m: ChatMessage) => !!m.sender && byAddr.has(m.sender);
  const party = chat.messages.filter(isParty).slice(-2);
  const other = chat.messages.filter((m) => !isParty(m)).slice(-1);
  const picked = party.length ? [...party, ...other] : chat.messages.slice(-3);
  // getChat returns chain order; ids are insertion order, so sort by position, not id.
  const pos = new Map(chat.messages.map((m, i) => [m.id, i]));
  picked.sort((a, b) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0));
  return {
    title,
    bubbles: picked.map((m) => ({
      name: isParty(m) ? shortLabel(byAddr.get(m.sender!) ?? null, m.sender!) : m.sender ? midEllipsis(m.sender, 20) : 'unknown sender',
      text: m.content || '',
      party: isParty(m),
    })),
    messageCount,
    partyCount: chat.participants.length,
  };
}

app.get('/og/chat/collection/:slug', async (c) => {
  const slug = c.req.param('slug')!.replace(/\.png$/, '');
  const col = await db.getCollectionBySlug(c.env.DB, slug);
  if (!col) return jsonError('not found', 404);
  const data = await chatCardData(c.env.DB, { collectionId: col.id }, col.name, col.message_count);
  return pngResponse(await svgToPng(chatCardSvg(data)));
});

app.get('/og/chat/address/:address', async (c) => {
  const address = c.req.param('address')!.replace(/\.png$/, '');
  const count = await db.countMessagesForAddress(c.env.DB, address);
  const data = await chatCardData(c.env.DB, { address }, midEllipsis(address, 30), count);
  if (count === 0 && data.partyCount === 0) return jsonError('not found', 404);
  return pngResponse(await svgToPng(chatCardSvg(data)));
});

app.get('/og/category/:slug', async (c) => {
  const slug = c.req.param('slug')!.replace(/\.png$/, '');
  const cat = categoryFromSlug(slug);
  if (!cat) return jsonError('not found', 404);
  const stats = await db.listCategories(c.env.DB);
  const count = stats.find((s) => categorySlug(s.category) === slug)?.count ?? 0;
  return pngResponse(await svgToPng(categoryCardSvg(cat, count)));
});

app.get('/og/protocol/:protocol', async (c) => {
  const protocol = slugParam(c.req.param('protocol').replace(/\.png$/, ''));
  if (!protocol) return c.notFound();
  const stats = await db.listProtocols(c.env.DB).catch(() => []);
  const count = stats.find((s) => s.protocol === protocol)?.count ?? 0;
  return pngResponse(await svgToPng(categoryCardSvg(protocolLabel(protocol), count)));
});

app.get('/og/tick/:tick', async (c) => {
  const tick = tickParam(decodeURIComponent(c.req.param('tick')).replace(/\.png$/, ''));
  if (!tick) return c.notFound();
  const stats = await db.listTicks(c.env.DB, undefined, 0, 500).catch(() => []);
  const count = stats.filter((s) => s.tick === tick).reduce((n, s) => n + s.count, 0);
  return pngResponse(await svgToPng(categoryCardSvg(`$${tick}`, count)));
});

app.get('/og/address/:address', async (c) => {
  const address = c.req.param('address')!.replace(/\.png$/, '');
  return pngResponse(await svgToPng(addressCardSvg(address)));
});

// Unmatched routes: return genuine HTTP 404 with noindex to prevent soft-404 index bloat.
app.get('*', async (c) => {
  if (c.req.path.startsWith('/api')) return jsonError('not found', 404);
  const origin = originOf(c);
  return c.html(
    renderIndex({
      title: 'Page not found \u2014 The Permanent Record',
      description: 'The requested transmission or collection does not exist.',
      url: origin + c.req.path,
      image: `${origin}/og/default.png`,
      noindex: true,
      initialHtml: renderNotFoundSsr(
        'Page not found',
        `The requested route \u201c${c.req.path}\u201d was not found.`
      ),
    }, await shellFor(c)),
    404
  );
});

// ---------------------------------------------------------------------------
// Manual cron trigger (protected by CRON_SECRET)
// ---------------------------------------------------------------------------

app.post('/api/cron/run', async (c) => {
  const secret = c.env.CRON_SECRET;
  const provided =
    c.req.header('x-cron-secret') || c.req.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (!secret || !provided || provided !== secret) return jsonError('unauthorized', 401);

  const summary = await runCron(c.env);
  return c.json({ ok: true, ...summary });
});

// ---------------------------------------------------------------------------
// Worker entry
// ---------------------------------------------------------------------------

export default {
  // Skip analytics for Tor visitors (ecosystem convention): CF tags Tor exits
  // as country T1. HTML pages are not edge-cached, so a per-request strip is safe.
  fetch: async (req: Request, env: Env, ctx: ExecutionContext): Promise<Response> => {
    const res = await app.fetch(req, env, ctx);
    const isTor = (req as any).cf?.country === 'T1';
    if (!isTor || !(res.headers.get('content-type') || '').includes('text/html')) return res;
    const html = await res.text();
    const out = new Response(html.replace(UMAMI_TAG, ''), res);
    out.headers.delete('content-length');
    return out;
  },
  scheduled: (_event: ScheduledEvent, env: Env, ctx: ExecutionContext): void => {
    ctx.waitUntil(runCron(env));
  },
};
