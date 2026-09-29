/**
 * IndexNow through the hub at indexnow.kyc.rip: every new human-message page
 * is announced once, minutes after it lands, instead of waiting for the
 * hub's half-hourly sitemap scan. Pure pieces (batch building, the watermark
 * decision, the reply parsing) are separate from the D1/fetch orchestration
 * so they are unit-tested without a Worker.
 */

import type { Env } from './types';
import * as db from './db';

export const BATCH_LIMIT = 200;
export const HUB_TIMEOUT_MS = 5000;
export const DEFAULT_HUB_URL = 'https://indexnow.kyc.rip/v1/submit';

export interface HubConfig {
  url: string;
  token: string;
  host: string;
}

export interface CandidateRow {
  id: number;
  txid: string;
  monitored_address: string | null;
}

export function hubConfig(env: Env): HubConfig | null {
  const token = (env.INDEXNOW_HUB_TOKEN || '').trim();
  if (!token) return null;
  return {
    url: (env.INDEXNOW_HUB_URL || DEFAULT_HUB_URL).trim(),
    token,
    host: (env.INDEXNOW_HOST || new URL(env.SITE_URL || 'https://opreturn.xyz').host).toLowerCase(),
  };
}

/**
 * URLs for a batch of new message rows: the message pages plus each touched
 * collection page (the collection is where the message shows up first).
 * The feed itself is deliberately not included: it changes every block and
 * the hub already tracks it from the sitemap.
 */
export function buildBatch(
  rows: CandidateRow[],
  addressToCollection: ReadonlyMap<string, string>,
  host: string
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (path: string) => {
    const u = `https://${host}${path}`;
    if (!seen.has(u)) {
      seen.add(u);
      out.push(u);
    }
  };
  for (const r of rows.slice(0, BATCH_LIMIT)) add(`/m/${r.txid}`);
  for (const r of rows.slice(0, BATCH_LIMIT)) {
    const slug = r.monitored_address ? addressToCollection.get(r.monitored_address) : undefined;
    if (slug) add(`/c/${slug}`);
  }
  // The cap is on what we send, whatever a caller passed in.
  return out.slice(0, BATCH_LIMIT);
}

export interface HubResult {
  ok: boolean;
  status: number;
  queued?: number;
  /** Status code plus a truncated body; never the request or its headers. */
  error?: string;
}

/** The stored error is what the hub said; the bearer token must never end up in ingest_state. */
function redact(text: string, token: string): string {
  return token ? text.split(token).join('[token]') : text;
}

/** Submit URLs to the hub. Never throws; a timeout or network failure is an error result. */
export async function submitToHub(fetchFn: typeof fetch, cfg: HubConfig, urls: string[], timeoutMs = HUB_TIMEOUT_MS): Promise<HubResult> {
  if (!urls.length) return { ok: true, status: 204, queued: 0 };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchFn(cfg.url, {
      method: 'POST',
      headers: { authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json', 'user-agent': 'opreturn-indexnow/1.0 (+https://opreturn.xyz)' },
      body: JSON.stringify({ host: cfg.host, urls }),
      signal: ctl.signal,
    });
    const text = await res.text().catch(() => '');
    if (res.status === 202 || res.status === 200) {
      let queued = urls.length;
      try {
        const j = JSON.parse(text) as { queued?: number };
        if (typeof j.queued === 'number') queued = j.queued;
      } catch {
        // a 2xx without JSON still counts as accepted
      }
      return { ok: true, status: res.status, queued };
    }
    return { ok: false, status: res.status, error: redact(`hub ${res.status}: ${text.slice(0, 160)}`, cfg.token) };
  } catch (e) {
    const msg = ctl.signal.aborted ? `hub timeout after ${timeoutMs} ms` : `hub request failed: ${String((e as Error)?.message ?? e).slice(0, 120)}`;
    return { ok: false, status: 0, error: redact(msg, cfg.token) };
  } finally {
    clearTimeout(timer);
  }
}

export interface PushSummary {
  skipped?: 'no-token' | 'bootstrap' | 'nothing';
  attempted: number;
  queued: number;
  error?: string;
}

/**
 * One cron step: announce the human-message representatives not yet pushed.
 * First ever run only records a bootstrap watermark (the archive is already
 * covered by the hub's sitemap watcher); later runs push in batches of
 * BATCH_LIMIT and mark rows pushed only after the hub accepted them, so a
 * failed call is simply retried next run.
 */
export async function pushIndexNow(env: Env, d1: D1Database, fetchFn: typeof fetch = fetch): Promise<PushSummary> {
  const cfg = hubConfig(env);
  if (!cfg) return { skipped: 'no-token', attempted: 0, queued: 0 };
  const state = await db.getIngestState(d1);
  const now = Math.floor(Date.now() / 1000);
  if (state.indexnow_bootstrap_id == null) {
    const maxId = await db.maxMessageId(d1);
    await db.setIngestState(d1, { indexnow_bootstrap_id: maxId, indexnow_last_ok: new Date().toISOString() });
    return { skipped: 'bootstrap', attempted: 0, queued: 0 };
  }
  const rows = await db.listIndexNowCandidates(d1, Number(state.indexnow_bootstrap_id), BATCH_LIMIT);
  if (!rows.length) return { skipped: 'nothing', attempted: 0, queued: 0 };
  const addrs = await db.listAddresses(d1).catch(() => []);
  const cols = await db.listCollections(d1).catch(() => []);
  const slugOf = new Map(cols.map((c) => [c.id, c.slug || String(c.id)]));
  const addressToCollection = new Map<string, string>();
  for (const a of addrs) {
    const slug = slugOf.get(a.collection_id);
    if (slug) addressToCollection.set(a.address, slug);
  }
  const urls = buildBatch(rows, addressToCollection, cfg.host);
  const result = await submitToHub(fetchFn, cfg, urls);
  const queued = result.queued ?? 0;
  // Rows are stamped only when the hub took the whole batch. A partial accept
  // (its daily cap) keeps every row for the next run; the 6 h per-URL cooldown
  // on the hub side makes the re-send of the accepted ones harmless.
  if (result.ok && queued >= urls.length) {
    await db.markIndexNowPushed(d1, rows.map((r) => r.id), now);
    await db.setIngestState(d1, { indexnow_last_ok: new Date().toISOString(), indexnow_last_error: '', indexnow_last_batch_urls: urls.length });
    return { attempted: urls.length, queued };
  }
  const error = result.ok ? `hub accepted ${queued} of ${urls.length} URLs (daily cap?)` : result.error || `hub ${result.status}`;
  await db.setIngestState(d1, { indexnow_last_error: error.slice(0, 200), indexnow_last_error_at: new Date().toISOString() });
  return { attempted: urls.length, queued: result.ok ? queued : 0, error };
}
