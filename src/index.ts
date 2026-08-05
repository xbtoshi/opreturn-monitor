import { Hono } from 'hono';
import type { Context } from 'hono';
import { runCron } from './cron';
import * as db from './db';
import { ensureSeeded } from './seed';
import type { Env } from './types';
import { renderIndex } from './ui';

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
  const sort = c.req.query('sort') === 'hot' ? ('hot' as const) : ('new' as const);
  const limit = Math.min(Math.max(Number(c.req.query('limit')) || 50, 1), 100);
  const rawBefore = c.req.query('before');
  const before = rawBefore ? Number(rawBefore) : undefined;

  const data = await db.getMessages(c.env.DB, { collectionId, sort, limit, before });
  return c.json(data);
});

app.post('/api/like', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { message_id?: unknown } | null;
  const messageId = Number(body?.message_id);
  if (!Number.isInteger(messageId) || messageId <= 0) {
    return jsonError('invalid message_id', 400);
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
  const body = (await c.req.json().catch(() => null)) as { name?: unknown; description?: unknown } | null;
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) return jsonError('name is required', 400);
  const description = typeof body?.description === 'string' ? body.description : null;
  const id = await db.createCollection(c.env.DB, name, description);
  return c.json({ ok: true, id });
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
