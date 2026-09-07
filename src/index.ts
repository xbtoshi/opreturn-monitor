import { Hono } from 'hono';
import type { Context } from 'hono';
import seedCollections from '../collections.json';
import { categoryFromSlug, categorySlug } from './classify';
import { classifyOnePass } from './cron';
import { runCron } from './cron';
import * as db from './db';
import { fetchHistoricalPriceUsd } from './mempool';
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
  generateApiCatalogJson,
  generateAuthMd,
  generateLlmsFullTxt,
  generateLlmsTxt,
  generateMcpServerCardJson,
  generateOAuthProtectedResourceJson,
  generateOAuthServerJson,
  generateOpenApiJson,
  generateRobotsTxt,
  generateSitemapXml,
  renderAddressMarkdown,
  renderAddressSsr,
  renderCategoryMarkdown,
  renderCategorySsr,
  renderCollectionMarkdown,
  renderCollectionSsr,
  renderCollectionsMarkdown,
  renderCollectionsSsr,
  renderFeedMarkdown,
  renderFeedSsr,
  renderGuideMarkdown,
  renderGuideSsr,
  renderLandingMarkdown,
  renderLandingSsr,
  renderMessageMarkdown,
  renderMessageSsr,
  renderNotFoundSsr,
} from './seo';
import { ensureSeeded, slugify } from './seed';
import type { ChatCardData } from './og';
import type { ChatMessage, CollectionWithStats, Env } from './types';
import { renderIndex } from './ui';

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

app.get('/api/price', async (c) => {
  const now = Math.floor(Date.now() / 1000);
  const raw = Number(c.req.query('ts'));
  const ts = Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), now) : now;
  const usd = await fetchHistoricalPriceUsd(c.env.MEMPOOL_BASE_URL || 'https://mempool.space', ts);
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

  const data = await db.getMessages(c.env.DB, {
    collectionId,
    address,
    category,
    sort,
    limit,
    before,
  });
  return c.json(data);
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
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
      },
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
  return new Response(generateLlmsTxt(origin), {
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

app.get('/sitemap.xml', async (c) => {
  const origin = originOf(c);
  const [cols, addrs, feedRes] = await Promise.all([
    db.listCollections(c.env.DB).catch(() => []),
    db.listAddresses(c.env.DB).catch(() => []),
    db.getMessages(c.env.DB, { sort: 'hot', limit: 100 }).catch(() => ({ messages: [] })),
  ]);
  const finalCols = cols.length ? cols : (seedCollections as unknown as CollectionWithStats[]);
  const topMsgs = feedRes.messages.map((m) => ({
    txid: m.txid,
    block_time: m.block_time,
    created_at: m.created_at,
  }));
  const xml = generateSitemapXml(origin, finalCols, addrs, topMsgs);
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

app.get('/auth.md', (c) => {
  const origin = originOf(c);
  return new Response(generateAuthMd(origin), {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'cache-control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
      'access-control-allow-origin': '*',
    },
  });
});

const handleOAuthProtected = (c: Context<Bindings>) => {
  const origin = originOf(c);
  return new Response(JSON.stringify(generateOAuthProtectedResourceJson(origin), null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
      'access-control-allow-origin': '*',
    },
  });
};

app.get('/.well-known/oauth-protected-resource', handleOAuthProtected);
app.get('/.well-known/oauth-protected-resource:suffix', handleOAuthProtected);
app.get('/.well-known/oauth-protected-resource%60', handleOAuthProtected);

const handleOAuthServer = (c: Context<Bindings>) => {
  const origin = originOf(c);
  return new Response(JSON.stringify(generateOAuthServerJson(origin), null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
      'access-control-allow-origin': '*',
    },
  });
};

app.get('/.well-known/oauth-authorization-server', handleOAuthServer);
app.get('/.well-known/oauth-authorization-server:suffix', handleOAuthServer);
app.get('/.well-known/oauth-authorization-server%60', handleOAuthServer);
app.get('/.well-known/openid-configuration', handleOAuthServer);
app.get('/.well-known/openid-configuration:suffix', handleOAuthServer);

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
        const res = await db.getMessages(c.env.DB, {
          collectionId: args.collection_id ? Number(args.collection_id) : undefined,
          address: args.address ? String(args.address) : undefined,
          category: args.category ? String(args.category) : undefined,
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
  const [cols, addrs, feedRes] = await Promise.all([
    db.listCollections(c.env.DB).catch(() => []),
    db.listAddresses(c.env.DB).catch(() => []),
    db.getMessages(c.env.DB, { sort: 'hot', limit: 1 }).catch(() => ({ messages: [] })),
  ]);
  const colsCount = cols.length || seedCollections.length;
  const addrsCount =
    addrs.length ||
    seedCollections.reduce((sum, col) => sum + (col.addresses?.length || 0), 0);
  const feat = feedRes.messages[0] || null;
  const cmap = new Map(cols.map((col) => [col.id, col.name]));
  const colName = feat?.collection_id ? cmap.get(feat.collection_id) : undefined;

  if (wantsMarkdown(c)) {
    return markdownResponse(
      renderLandingMarkdown(origin, colsCount, addrsCount, feat, colName),
      origin
    );
  }

  applyDiscoveryHeaders(c, origin);
  const graph = [...buildWebSiteGraph(origin), buildFaqSchema()];
  const initialHtml = renderLandingSsr(colsCount, addrsCount, feat, colName);

  return c.html(
    renderIndex({
      title: 'The Permanent Record \u2014 messages inside Bitcoin',
      description:
        'People are leaving messages inside Bitcoin. Forever. Threats, confessions, prayers, ads, haiku \u2014 archived live from the chain.',
      url: origin + '/',
      image: origin + '/og/default.png',
      jsonLd: { '@context': 'https://schema.org', '@graph': graph },
      initialHtml,
    })
  );
});

app.get('/feed', (c) => {
  const origin = originOf(c);
  if (wantsMarkdown(c)) {
    return markdownResponse(renderFeedMarkdown(origin), origin);
  }
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
      initialHtml: renderFeedSsr(),
    })
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
    })
  );
});

app.get('/guide', (c) => {
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
    })
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
      }),
      404
    );
  }
  const cmap = await collectionMap(c.env.DB);
  const colName = msg.collection_id != null ? cmap.get(msg.collection_id)?.name ?? '' : '';

  if (wantsMarkdown(c)) {
    return markdownResponse(renderMessageMarkdown(origin, msg, colName), origin);
  }

  applyDiscoveryHeaders(c, origin);
  const postSchema = buildMessageSchema(origin, msg, colName);
  const crumbs = buildBreadcrumbSchema(origin, [
    { name: 'Home', path: '/' },
    { name: 'Transmissions', path: '/feed' },
    { name: `\u201c${clamp(msg.content || 'OP_RETURN', 24)}\u201d`, path: `/m/${txid}` },
  ]);
  return c.html(
    renderIndex({
      title: `\u201c${clamp(msg.content || 'OP_RETURN', 64)}\u201d`,
      description: `${colName || 'Untracked address'} \u00b7 ${shortAddr(msg.address)} \u00b7 ${msg.likes} likes \u00b7 The Permanent Record`,
      url: `${origin}/m/${txid}`,
      image: `${origin}/og/message/${txid}.png`,
      type: 'article',
      jsonLd: { '@context': 'https://schema.org', '@graph': [postSchema, crumbs] },
      initialHtml: renderMessageSsr(msg, colName),
    })
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
      }),
      404
    );
  }
  const allAddrs = await db.listAddresses(c.env.DB).catch(() => []);
  const colAddrs = allAddrs.filter((a) => a.collection_id === col.id);

  if (wantsMarkdown(c)) {
    return markdownResponse(renderCollectionMarkdown(origin, col, colAddrs), origin);
  }

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
      initialHtml: renderCollectionSsr(col, colAddrs),
    })
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
      }),
      404
    );
  }
  if (wantsMarkdown(c)) {
    return markdownResponse(
      `# ${col.name} — Chat Room\n\n${col.description || ''}\n\n* Messages: ${col.message_count}\n* Addresses: ${col.address_count}\n* Chat API: ${origin}/api/chat?collection_id=${col.id}\n`,
      origin
    );
  }
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
      initialHtml: renderCollectionSsr(col, []),
    })
  );
});

app.get('/a/:address', (c) => {
  const address = c.req.param('address');
  const origin = originOf(c);
  if (wantsMarkdown(c)) {
    return markdownResponse(renderAddressMarkdown(origin, address), origin);
  }
  applyDiscoveryHeaders(c, origin);
  const crumbs = buildBreadcrumbSchema(origin, [
    { name: 'Home', path: '/' },
    { name: 'Address Record', path: `/a/${address}` },
  ]);
  return c.html(
    renderIndex({
      title: `Address record \u2014 ${address}`,
      description: `Every archived OP_RETURN message sent to ${address}.`,
      url: `${origin}/a/${address}`,
      image: `${origin}/og/address/${encodeURIComponent(address)}.png`,
      jsonLd: crumbs,
      initialHtml: renderAddressSsr(address),
    })
  );
});

app.get('/a/:address/chat', (c) => {
  const address = c.req.param('address');
  const origin = originOf(c);
  if (wantsMarkdown(c)) {
    return markdownResponse(
      `# Chat Room: ${address}\n\nOn-chain communications involving ${address}.\n\n* Chat API: ${origin}/api/chat?address=${encodeURIComponent(address)}\n`,
      origin
    );
  }
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
      jsonLd: crumbs,
      initialHtml: renderAddressSsr(address),
    })
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
      }),
      404
    );
  }
  const stats = await db.listCategories(c.env.DB);
  const count = stats.find((s) => categorySlug(s.category) === slug)?.count ?? 0;

  if (wantsMarkdown(c)) {
    return markdownResponse(renderCategoryMarkdown(origin, cat, count), origin);
  }

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
      initialHtml: renderCategorySsr(cat, count),
    })
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

app.get('/og/address/:address', async (c) => {
  const address = c.req.param('address')!.replace(/\.png$/, '');
  return pngResponse(await svgToPng(addressCardSvg(address)));
});

// Unmatched routes: return genuine HTTP 404 with noindex to prevent soft-404 index bloat.
app.get('*', (c) => {
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
    }),
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
  fetch: app.fetch,
  scheduled: (_event: ScheduledEvent, env: Env, ctx: ExecutionContext): void => {
    ctx.waitUntil(runCron(env));
  },
};
