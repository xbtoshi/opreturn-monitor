import { Hono } from 'hono';
import type { Context } from 'hono';
import { categoryFromSlug, categorySlug } from './classify';
import { runCron } from './cron';
import * as db from './db';
import {
  addressCardSvg,
  categoryCardSvg,
  collectionCardSvg,
  defaultCardSvg,
  messageCardSvg,
  pngResponse,
  svgToPng,
} from './og';
import { ensureSeeded, slugify } from './seed';
import type { CollectionWithStats, Env } from './types';
import { renderIndex, type PageMeta } from './ui';

type Bindings = { Bindings: Env };

const app = new Hono<Bindings>();

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
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

app.get('/', (c) => c.html(renderIndex()));

app.get('/api/health', (c) => c.json({ ok: true, time: new Date().toISOString() }));

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
  const rawBefore = c.req.query('before');
  const before = rawBefore ? Number(rawBefore) : undefined;

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

app.post('/api/like', async (c) => {
  const body = (await c.req.json().catch(() => null)) as
    | { message_id?: unknown; nonce?: unknown }
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

  await db.addVote(c.env.DB, messageId, voterHash);
  const updated = await db.getMessage(c.env.DB, messageId);
  return c.json({ ok: true, likes: updated?.likes ?? 0 });
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

// ---------------------------------------------------------------------------
// SPA pages + Open Graph (real paths so X/Slack/Telegram crawlers see per-item
// cards — crawlers do not execute JS and never send URL hash fragments)
// ---------------------------------------------------------------------------

function originOf(c: Context<Bindings>): string {
  return new URL(c.req.url).origin;
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

function page(c: Context<Bindings>, meta?: PageMeta): Response {
  return c.html(renderIndex(meta));
}

app.get('/', (c) =>
  page(c, {
    title: 'The Permanent Record \u2014 messages inside Bitcoin',
    description:
      'People are leaving messages inside Bitcoin. Forever. Threats, confessions, prayers, ads, haiku \u2014 archived live from the chain.',
    url: originOf(c) + '/',
    image: originOf(c) + '/og/default.png',
  })
);

app.get('/feed', (c) =>
  page(c, {
    title: 'All transmissions \u2014 The Permanent Record',
    description: 'Every monitored OP_RETURN message, live from the chain.',
    url: originOf(c) + '/feed',
    image: originOf(c) + '/og/default.png',
  })
);

app.get('/collections', (c) =>
  page(c, {
    title: 'Collections \u2014 The Permanent Record',
    description: 'Addresses grouped by the phenomenon behind them.',
    url: originOf(c) + '/collections',
    image: originOf(c) + '/og/default.png',
  })
);

app.get('/guide', (c) =>
  page(c, {
    title: 'Field Manual \u2014 etch a message onto Bitcoin',
    description: 'How to attach an OP_RETURN output and leave a permanent mark.',
    url: originOf(c) + '/guide',
    image: originOf(c) + '/og/default.png',
  })
);

app.get('/m/:txid', async (c) => {
  const txid = c.req.param('txid')!;
  const msg = await db.getMessageByTxid(c.env.DB, txid);
  const origin = originOf(c);
  if (!msg) {
    return page(c, { title: 'Message not found', url: `${origin}/m/${txid}`, image: `${origin}/og/default.png` });
  }
  const cmap = await collectionMap(c.env.DB);
  const colName = msg.collection_id != null ? cmap.get(msg.collection_id)?.name ?? '' : '';
  return page(c, {
    title: `\u201c${clamp(msg.content || 'OP_RETURN', 64)}\u201d`,
    description: `${colName || 'Untracked address'} \u00b7 ${shortAddr(msg.address)} \u00b7 ${msg.likes} likes \u00b7 The Permanent Record`,
    url: `${origin}/m/${txid}`,
    image: `${origin}/og/message/${txid}.png`,
    type: 'article',
  });
});

app.get('/c/:slug', async (c) => {
  const slug = c.req.param('slug');
  const col = await db.getCollectionBySlug(c.env.DB, slug);
  const origin = originOf(c);
  if (!col) {
    return page(c, { title: 'Collection not found', url: `${origin}/c/${slug}`, image: `${origin}/og/default.png` });
  }
  return page(c, {
    title: col.name,
    description: `${clamp(col.description || 'Addresses monitored on-chain.', 120)} \u00b7 ${col.address_count} addresses \u00b7 ${col.message_count} messages`,
    url: `${origin}/c/${slug}`,
    image: `${origin}/og/collection/${slug}.png`,
  });
});

app.get('/a/:address', (c) => {
  const address = c.req.param('address');
  const origin = originOf(c);
  return page(c, {
    title: `Address record \u2014 ${address}`,
    description: `Every archived OP_RETURN message sent to ${address}.`,
    url: `${origin}/a/${address}`,
    image: `${origin}/og/address/${encodeURIComponent(address)}.png`,
  });
});

app.get('/cat/:slug', async (c) => {
  const slug = c.req.param('slug')!;
  const cat = categoryFromSlug(slug);
  const origin = originOf(c);
  if (!cat) {
    return page(c, { title: 'Category not found', url: `${origin}/cat/${slug}`, image: `${origin}/og/default.png` });
  }
  const stats = await db.listCategories(c.env.DB);
  const count = stats.find((s) => categorySlug(s.category) === slug)?.count ?? 0;
  return page(c, {
    title: `${cat} \u2014 The Permanent Record`,
    description: `${count} archived messages classified as ${cat.toLowerCase()}.`,
    url: `${origin}/cat/${slug}`,
    image: `${origin}/og/category/${slug}.png`,
  });
});

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

// Anything else: the SPA shell so in-app paths deep-link fine; /api stays JSON.
app.get('*', (c) => {
  if (c.req.path.startsWith('/api')) return jsonError('not found', 404);
  return page(c, {
    title: 'The Permanent Record \u2014 messages inside Bitcoin',
    url: originOf(c) + c.req.path,
    image: originOf(c) + '/og/default.png',
  });
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
