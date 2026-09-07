import type { Address, ChatMessage, ChatParticipant, CollectionWithStats, Message } from './types';

function num(row: Record<string, unknown>, key: string): number {
  const v = row[key];
  return typeof v === 'number' ? v : Number(v ?? 0);
}

function str(row: Record<string, unknown>, key: string): string {
  const v = row[key];
  return v == null ? '' : String(v);
}

function nullableStr(row: Record<string, unknown>, key: string): string | null {
  const v = row[key];
  return v == null ? null : String(v);
}

export async function listCollections(db: D1Database): Promise<CollectionWithStats[]> {
  const { results } = await db
    .prepare(
      `SELECT c.id, c.name, c.description, c.slug, c.created_at,
              (SELECT COUNT(*) FROM addresses a WHERE a.collection_id = c.id) AS address_count,
              (SELECT COUNT(*) FROM messages m
                 JOIN addresses a ON a.address = m.address
                WHERE a.collection_id = c.id) AS message_count
         FROM collections c
        ORDER BY c.id ASC`
    )
    .all<Record<string, unknown>>();

  return results.map((r) => ({
    id: num(r, 'id'),
    name: str(r, 'name'),
    description: nullableStr(r, 'description'),
    slug: nullableStr(r, 'slug'),
    created_at: str(r, 'created_at'),
    address_count: num(r, 'address_count'),
    message_count: num(r, 'message_count'),
  }));
}

export async function getCollectionBySlug(db: D1Database, slug: string): Promise<CollectionWithStats | null> {
  const rows = await listCollections(db);
  return rows.find((c) => c.slug && c.slug.toLowerCase() === slug.toLowerCase()) ?? null;
}

export interface CategoryStat {
  category: string;
  count: number;
}

export async function listCategories(db: D1Database): Promise<CategoryStat[]> {
  const { results } = await db
    .prepare(
      `SELECT m.category AS category, COUNT(*) AS count
         FROM messages m
        WHERE m.category IS NOT NULL AND m.category != ''
        GROUP BY m.category
        ORDER BY count DESC, category ASC`
    )
    .all<Record<string, unknown>>();

  return results.map((r) => ({
    category: str(r, 'category'),
    count: num(r, 'count'),
  }));
}

export async function listAddresses(db: D1Database): Promise<Address[]> {
  const { results } = await db
    .prepare('SELECT id, address, label, collection_id, created_at FROM addresses ORDER BY id ASC')
    .all<Record<string, unknown>>();

  return results.map((r) => ({
    id: num(r, 'id'),
    address: str(r, 'address'),
    label: nullableStr(r, 'label'),
    collection_id: num(r, 'collection_id'),
    created_at: str(r, 'created_at'),
  }));
}

export async function getCollection(db: D1Database, id: number): Promise<CollectionWithStats | null> {
  const rows = await listCollections(db);
  return rows.find((c) => c.id === id) ?? null;
}

export interface GetMessagesOpts {
  collectionId?: number;
  address?: string;
  category?: string;
  sort: 'hot' | 'new';
  limit: number;
  /** Opaque keyset cursor from a previous page's next_before ("likes:ts:id"). */
  before?: string;
}

/** Effective chain time: confirmation time, else the moment we first saw it in the mempool. */
const TS_EXPR = "COALESCE(m.block_time, CAST(strftime('%s', m.created_at) AS INTEGER))";

function encodeCursor(m: { likes: number; ts: number; id: number }): string {
  return `${m.likes}:${m.ts}:${m.id}`;
}

function decodeCursor(raw: string): { likes: number; ts: number; id: number } | null {
  const parts = raw.split(':').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  return { likes: parts[0], ts: parts[1], id: parts[2] };
}

export async function getMessages(
  db: D1Database,
  opts: GetMessagesOpts
): Promise<{ messages: Message[]; next_before: string | null }> {
  const params: unknown[] = [];
  let where = '';

  if (opts.collectionId) {
    where = 'WHERE a.collection_id = ?';
    params.push(opts.collectionId);
  }
  if (opts.address) {
    where += where ? ' AND m.address = ?' : 'WHERE m.address = ?';
    params.push(opts.address);
  }
  if (opts.category) {
    where += where ? ' AND m.category = ?' : 'WHERE m.category = ?';
    params.push(opts.category);
  }
  // The before-cursor is applied OUTSIDE the window subquery so each
  // (address, content) group keeps one stable representative (its newest tx)
  // across pages instead of resurfacing on every page.
  //
  // Ordering is by chain time (ts), not insertion id: backfilling a new
  // collection inserts historical txs out of chronological order, and the UI
  // displays block time, so sorting by id put cards visibly out of sequence.
  // Pagination is a keyset over the same (likes, ts, id) tuple the ORDER BY
  // uses, so pages never skip or repeat rows.
  const outer: string[] = ['rn = 1'];
  const cur = opts.before ? decodeCursor(opts.before) : null;
  if (cur) {
    const timeKey = '(ts < ? OR (ts = ? AND id < ?))';
    if (opts.sort === 'hot') {
      outer.push(`(likes < ? OR (likes = ? AND ${timeKey}))`);
      params.push(cur.likes, cur.likes, cur.ts, cur.ts, cur.id);
    } else {
      outer.push(timeKey);
      params.push(cur.ts, cur.ts, cur.id);
    }
  }

  const order = opts.sort === 'hot' ? 'likes DESC, ts DESC, id DESC' : 'ts DESC, id DESC';
  params.push(opts.limit);

  const { results } = await db
    .prepare(
      `SELECT * FROM (
         SELECT m.id, m.txid, m.address, m.content, m.category, m.likes, m.is_mempool, m.created_at,
                m.block_time, m.fee_sats, m.fee_rate, a.collection_id,
                ${TS_EXPR} AS ts,
                COUNT(*) OVER (PARTITION BY m.address, COALESCE(m.content, m.txid)) AS dup_count,
                ROW_NUMBER() OVER (PARTITION BY m.address, COALESCE(m.content, m.txid)
                                   ORDER BY ${TS_EXPR} DESC, m.id DESC) AS rn
           FROM messages m
           JOIN addresses a ON a.address = m.address
           ${where}
       )
        WHERE ${outer.join(' AND ')}
        ORDER BY ${order} LIMIT ?`
    )
    .bind(...params)
    .all<Record<string, unknown>>();

  const messages = results.map((r) => ({
    id: num(r, 'id'),
    txid: str(r, 'txid'),
    address: str(r, 'address'),
    content: nullableStr(r, 'content'),
    category: nullableStr(r, 'category'),
    likes: num(r, 'likes'),
    is_mempool: num(r, 'is_mempool'),
    created_at: str(r, 'created_at'),
    block_time: r.block_time == null ? null : num(r, 'block_time'),
    raw_hex: null,
    fee_sats: r.fee_sats == null ? null : num(r, 'fee_sats'),
    fee_rate: r.fee_rate == null ? null : num(r, 'fee_rate'),
    collection_id: r.collection_id == null ? null : num(r, 'collection_id'),
    dup_count: num(r, 'dup_count'),
  }));

  let next_before: string | null = null;
  if (messages.length >= opts.limit) {
    const last = results[results.length - 1];
    next_before = encodeCursor({ likes: num(last, 'likes'), ts: num(last, 'ts'), id: num(last, 'id') });
  }
  return { messages, next_before };
}

export interface GetChatOpts {
  collectionId?: number;
  address?: string;
  limit: number;
  /** "ts:id" of the oldest bubble already shown; returns rows strictly older. */
  before?: string;
}

function decodeChatCursor(raw: string): { ts: number; id: number } | null {
  const parts = raw.split(':').map(Number);
  if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) return null;
  return { ts: parts[0], id: parts[1] };
}

/**
 * Conversation view: the newest `limit` messages of a collection (or one
 * address) returned oldest-first, each attributed to its sender.
 *
 * Dedupe differs from the feed on purpose. Spam from unknown senders is
 * collapsed per (sender, content) so a bot repeating an ad 6 times is one
 * bubble with dup_count=6 — but grouping by sender (not by monitored address)
 * means a bubble is never shown under the wrong name. Messages written by a
 * monitored party (a labelled address) are never collapsed: a hacker saying
 * "yes" twice is two real turns in a conversation.
 */
export async function getChat(
  db: D1Database,
  opts: GetChatOpts
): Promise<{ participants: ChatParticipant[]; messages: ChatMessage[]; next_before: string | null }> {
  // Bind order must follow the order of '?' in the SQL: is_party subquery,
  // then the row filter, then the cursor, then the limit.
  const params: unknown[] = [];
  // "Party" means a labelled address of THIS room, matching what the UI can
  // name; an address monitored under some other collection is just a sender.
  const partySql = opts.address
    ? 'm.sender = ?'
    : 'EXISTS (SELECT 1 FROM addresses p WHERE p.address = m.sender AND p.collection_id = ?)';
  params.push(opts.address ?? opts.collectionId ?? 0);

  let where = '';
  if (opts.collectionId) {
    where = 'WHERE a.collection_id = ?';
    params.push(opts.collectionId);
  }
  if (opts.address) {
    where += where ? ' AND m.address = ?' : 'WHERE m.address = ?';
    params.push(opts.address);
  }

  const outer: string[] = ['(rn = 1 OR is_party = 1)'];
  const cur = opts.before ? decodeChatCursor(opts.before) : null;
  if (cur) {
    outer.push('(ts < ? OR (ts = ? AND id < ?))');
    params.push(cur.ts, cur.ts, cur.id);
  }
  // One extra row tells us whether an older page really exists.
  params.push(opts.limit + 1);

  const participantsQ = opts.address
    ? db.prepare('SELECT address, label FROM addresses WHERE address = ?').bind(opts.address)
    : db
        .prepare('SELECT address, label FROM addresses WHERE collection_id = ? ORDER BY id ASC')
        .bind(opts.collectionId ?? 0);

  const [partRes, msgRes] = await Promise.all([
    participantsQ.all<{ address: string; label: string | null }>(),
    db
      .prepare(
        `SELECT * FROM (
           SELECT m.id, m.txid, m.address, m.sender, m.content, m.category, m.likes, m.is_mempool,
                  m.created_at, m.block_time, m.fee_sats, m.fee_rate, a.collection_id,
                  ${TS_EXPR} AS ts,
                  (${partySql}) AS is_party,
                  COUNT(*) OVER (PARTITION BY COALESCE(m.sender, ''), COALESCE(m.content, m.txid)) AS dup_count,
                  ROW_NUMBER() OVER (PARTITION BY COALESCE(m.sender, ''), COALESCE(m.content, m.txid)
                                     ORDER BY ${TS_EXPR} DESC, m.id DESC) AS rn
             FROM messages m
             JOIN addresses a ON a.address = m.address
             ${where}
         )
          WHERE ${outer.join(' AND ')}
          ORDER BY ts DESC, id DESC LIMIT ?`
      )
      .bind(...params)
      .all<Record<string, unknown>>(),
  ]);

  const hasMore = msgRes.results.length > opts.limit;
  const rows = hasMore ? msgRes.results.slice(0, opts.limit) : msgRes.results;
  const messages: ChatMessage[] = rows
    .map((r) => ({
      id: num(r, 'id'),
      txid: str(r, 'txid'),
      address: str(r, 'address'),
      sender: nullableStr(r, 'sender'),
      content: nullableStr(r, 'content'),
      category: nullableStr(r, 'category'),
      likes: num(r, 'likes'),
      is_mempool: num(r, 'is_mempool'),
      created_at: str(r, 'created_at'),
      block_time: r.block_time == null ? null : num(r, 'block_time'),
      raw_hex: null,
      fee_sats: r.fee_sats == null ? null : num(r, 'fee_sats'),
      fee_rate: r.fee_rate == null ? null : num(r, 'fee_rate'),
      collection_id: r.collection_id == null ? null : num(r, 'collection_id'),
      // A party's repeated turns are kept as separate bubbles, so don't badge them.
      dup_count: num(r, 'is_party') ? 1 : num(r, 'dup_count'),
    }))
    .reverse();

  let next_before: string | null = null;
  if (hasMore) {
    const oldest = rows[rows.length - 1];
    next_before = `${num(oldest, 'ts')}:${num(oldest, 'id')}`;
  }
  return { participants: partRes.results, messages, next_before };
}

function mapMessage(row: Record<string, unknown>): Message {
  return {
    id: num(row, 'id'),
    txid: str(row, 'txid'),
    address: str(row, 'address'),
    content: nullableStr(row, 'content'),
    category: nullableStr(row, 'category'),
    likes: num(row, 'likes'),
    is_mempool: num(row, 'is_mempool'),
    created_at: str(row, 'created_at'),
    block_time: row.block_time == null ? null : num(row, 'block_time'),
    raw_hex: nullableStr(row, 'raw_hex'),
    fee_sats: row.fee_sats == null ? null : num(row, 'fee_sats'),
    fee_rate: row.fee_rate == null ? null : num(row, 'fee_rate'),
    collection_id: row.collection_id == null ? null : num(row, 'collection_id'),
  };
}

const SELECT_MESSAGE = `
  SELECT m.*, a.collection_id
    FROM messages m
    LEFT JOIN addresses a ON a.address = m.address
   WHERE `;

export async function getMessage(db: D1Database, id: number): Promise<Message | null> {
  const row = await db.prepare(SELECT_MESSAGE + 'm.id = ?').bind(id).first<Record<string, unknown>>();
  return row ? mapMessage(row) : null;
}

export async function getMessageByTxid(db: D1Database, txid: string): Promise<Message | null> {
  const row = await db.prepare(SELECT_MESSAGE + 'm.txid = ?').bind(txid).first<Record<string, unknown>>();
  return row ? mapMessage(row) : null;
}

export interface NewMessage {
  txid: string;
  address: string;
  content: string;
  raw_hex: string | null;
  is_mempool: boolean;
  fee_sats: number | null;
  fee_rate: number | null;
  block_time: number | null;
  sender: string | null;
}

/**
 * Insert a message. Returns true if it was newly inserted (txid was unique),
 * false if it already existed.
 */
export async function insertMessage(db: D1Database, msg: NewMessage): Promise<boolean> {
  const res = await db
    .prepare(
      'INSERT OR IGNORE INTO messages (txid, address, content, is_mempool, raw_hex, fee_sats, fee_rate, block_time, sender) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(
      msg.txid,
      msg.address,
      msg.content,
      msg.is_mempool ? 1 : 0,
      msg.raw_hex,
      msg.fee_sats,
      msg.fee_rate,
      msg.block_time,
      msg.sender
    )
    .run();
  return res.meta.changes > 0;
}

/** Fill in who wrote a message for rows that predate the sender column. */
export async function backfillSender(db: D1Database, txid: string, sender: string): Promise<void> {
  await db
    .prepare('UPDATE messages SET sender = ? WHERE txid = ? AND sender IS NULL')
    .bind(sender, txid)
    .run();
}

/** Up to `limit` txids still missing a sender, newest first so live rooms fill in first. */
export async function listMessagesMissingSender(db: D1Database, limit: number): Promise<string[]> {
  const { results } = await db
    .prepare('SELECT txid FROM messages WHERE sender IS NULL ORDER BY id DESC LIMIT ?')
    .bind(limit)
    .all<{ txid: string }>();
  return results.map((r) => r.txid);
}

/** Fill in the on-chain time for messages that predate the block_time feature. */
export async function backfillBlockTime(
  db: D1Database,
  txid: string,
  blockTime: number
): Promise<void> {
  await db
    .prepare('UPDATE messages SET block_time = ? WHERE txid = ? AND block_time IS NULL')
    .bind(blockTime, txid)
    .run();
}

/** Flip a mempool row to confirmed once its tx has a block. */
export async function confirmMessage(
  db: D1Database,
  txid: string,
  blockTime: number | null
): Promise<void> {
  await db
    .prepare(
      'UPDATE messages SET is_mempool = 0, block_time = COALESCE(block_time, ?) WHERE txid = ? AND is_mempool = 1'
    )
    .bind(blockTime, txid)
    .run();
}

/** Repair rows stuck as mempool even though a confirmation time was recorded. */
export async function repairConfirmedFlags(db: D1Database): Promise<number> {
  const res = await db
    .prepare('UPDATE messages SET is_mempool = 0 WHERE is_mempool = 1 AND block_time IS NOT NULL')
    .run();
  return res.meta.changes;
}

/**
 * Delete unconfirmed rows for an address whose tx is no longer in the live
 * mempool (RBF-replaced or evicted). Rows with a recorded block_time are
 * never touched — they confirmed, even if the flag is stale.
 */
export async function deleteStaleMempool(
  db: D1Database,
  address: string,
  liveMempoolTxids: string[]
): Promise<number> {
  if (liveMempoolTxids.length > 90) return 0; // stay under D1's bind-param limit
  const notIn = liveMempoolTxids.length
    ? ` AND txid NOT IN (${liveMempoolTxids.map(() => '?').join(',')})`
    : '';
  const res = await db
    .prepare(
      `DELETE FROM messages WHERE address = ? AND is_mempool = 1 AND block_time IS NULL${notIn}`
    )
    .bind(address, ...liveMempoolTxids)
    .run();
  return res.meta.changes;
}

/** Fill in fee columns for messages that predate the fee feature (no-op once set). */
export async function backfillFees(
  db: D1Database,
  txid: string,
  feeSats: number,
  feeRate: number | null
): Promise<void> {
  await db
    .prepare('UPDATE messages SET fee_sats = ?, fee_rate = ? WHERE txid = ? AND fee_sats IS NULL')
    .bind(feeSats, feeRate, txid)
    .run();
}

/** Up to `limit` txids whose fee columns are still null, oldest first. */
export async function listMessagesMissingFees(db: D1Database, limit: number): Promise<string[]> {
  const { results } = await db
    .prepare('SELECT txid FROM messages WHERE fee_sats IS NULL ORDER BY id ASC LIMIT ?')
    .bind(limit)
    .all<{ txid: string }>();
  return results.map((r) => r.txid);
}

export async function getUnclassifiedMessages(db: D1Database, limit: number): Promise<Message[]> {
  const { results } = await db
    .prepare(
      `SELECT id, txid, address, content FROM messages
        WHERE category IS NULL AND content IS NOT NULL AND length(trim(content)) > 0
        ORDER BY id ASC LIMIT ?`
    )
    .bind(limit)
    .all<Record<string, unknown>>();

  return results.map((r) => ({
    id: num(r, 'id'),
    txid: str(r, 'txid'),
    address: str(r, 'address'),
    content: nullableStr(r, 'content'),
    category: null,
    likes: 0,
    is_mempool: 0,
    created_at: '',
    block_time: null,
    raw_hex: null,
    fee_sats: null,
    fee_rate: null,
    collection_id: null,
  }));
}

export async function setCategory(db: D1Database, messageId: number, category: string): Promise<void> {
  await db.prepare('UPDATE messages SET category = ? WHERE id = ?').bind(category, messageId).run();
}

export async function countUnclassified(db: D1Database): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM messages
        WHERE category IS NULL AND content IS NOT NULL AND length(trim(content)) > 0`
    )
    .first<{ n: number }>();
  return Number(row?.n ?? 0);
}

export async function getVote(db: D1Database, messageId: number, voterHash: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 AS found FROM votes WHERE message_id = ? AND voter_hash = ?')
    .bind(messageId, voterHash)
    .first<Record<string, unknown>>();
  return Boolean(row);
}

export async function addVote(db: D1Database, messageId: number, voterHash: string): Promise<void> {
  await db.batch([
    db.prepare('INSERT INTO votes (message_id, voter_hash) VALUES (?, ?)').bind(messageId, voterHash),
    db.prepare('UPDATE messages SET likes = likes + 1 WHERE id = ?').bind(messageId),
  ]);
}

/** Deterministic pseudo-random likes seeded from the txid, log-uniform so the
 *  count spans decades (a few messages stand out, most stay modest) — bootstrap
 *  so the site doesn't look empty. Idempotent: only rows with likes = 0 are touched. */
export async function seedInitialLikes(db: D1Database): Promise<number> {
  const { results } = await db
    .prepare('SELECT id, txid FROM messages WHERE likes = 0 ORDER BY id ASC')
    .all<{ id: number; txid: string }>();

  let updated = 0;
  for (const r of results) {
    let h = 0;
    for (let i = 0; i < r.txid.length; i++) h = (h * 31 + r.txid.charCodeAt(i)) >>> 0;
    const u = (h % 9973) / 9973;
    // Log-uniform in [1, 720]: exp(u * ln(720)) spans 1..720 with ~half under 27.
    const likes = Math.max(1, Math.round(Math.exp(u * Math.log(720))));
    await db
      .prepare('UPDATE messages SET likes = ? WHERE id = ? AND likes = 0')
      .bind(likes, r.id)
      .run();
    updated++;
  }
  return updated;
}

export async function createCollection(
  db: D1Database,
  name: string,
  description: string | null,
  slug: string | null
): Promise<number> {
  const res = await db
    .prepare('INSERT INTO collections (name, description, slug) VALUES (?, ?, ?)')
    .bind(name, description ?? null, slug)
    .run();
  return Number(res.meta.last_row_id);
}

export async function createAddress(
  db: D1Database,
  address: string,
  label: string | null,
  collectionId: number
): Promise<{ ok: boolean; error?: string }> {
  const col = await getCollection(db, collectionId);
  if (!col) return { ok: false, error: 'collection not found' };
  try {
    await db
      .prepare('INSERT OR IGNORE INTO addresses (address, label, collection_id) VALUES (?, ?, ?)')
      .bind(address, label ?? null, collectionId)
      .run();
    return { ok: true };
  } catch {
    return { ok: false, error: 'failed to insert address' };
  }
}

export async function deleteAddress(db: D1Database, id: number): Promise<boolean> {
  const res = await db.prepare('DELETE FROM addresses WHERE id = ?').bind(id).run();
  return res.meta.changes > 0;
}

// ---------------------------------------------------------------------------
// Address suggestions (public queue → admin review). See migration 0005.
// ---------------------------------------------------------------------------

export interface AddressSuggestion {
  id: number;
  address: string;
  collection_id: number | null;
  collection_name: string | null;
  note: string | null;
  status: string;
  created_at: string;
}

/** Queue a public suggestion. Rejects addresses already monitored or already pending. */
export async function createSuggestion(
  db: D1Database,
  address: string,
  collectionId: number | null,
  note: string | null,
  voterHash: string | null
): Promise<{ ok: boolean; error?: string }> {
  const existing = await db.prepare('SELECT 1 AS f FROM addresses WHERE address = ?').bind(address).first();
  if (existing) return { ok: false, error: 'already monitored' };
  const res = await db
    .prepare(
      "INSERT INTO address_suggestions (address, collection_id, note, voter_hash) " +
        "SELECT ?, ?, ?, ? WHERE NOT EXISTS " +
        "(SELECT 1 FROM address_suggestions WHERE address = ? AND status = 'pending')"
    )
    .bind(address, collectionId, note, voterHash, address)
    .run();
  if (!res.meta.changes) return { ok: false, error: 'already suggested' };
  return { ok: true };
}

export async function listSuggestions(db: D1Database, status = 'pending'): Promise<AddressSuggestion[]> {
  const { results } = await db
    .prepare(
      `SELECT s.id, s.address, s.collection_id, s.note, s.status, s.created_at, c.name AS collection_name
         FROM address_suggestions s
         LEFT JOIN collections c ON c.id = s.collection_id
        WHERE s.status = ?
        ORDER BY s.id DESC`
    )
    .bind(status)
    .all<Record<string, unknown>>();
  return results.map((r) => ({
    id: num(r, 'id'),
    address: str(r, 'address'),
    collection_id: r.collection_id == null ? null : num(r, 'collection_id'),
    collection_name: nullableStr(r, 'collection_name'),
    note: nullableStr(r, 'note'),
    status: str(r, 'status'),
    created_at: str(r, 'created_at'),
  }));
}

export async function setSuggestionStatus(db: D1Database, id: number, status: string): Promise<boolean> {
  const res = await db.prepare('UPDATE address_suggestions SET status = ? WHERE id = ?').bind(status, id).run();
  return res.meta.changes > 0;
}

/** Approve a pending suggestion: promote it into `addresses`, then mark approved. */
export async function approveSuggestion(db: D1Database, id: number): Promise<{ ok: boolean; error?: string }> {
  const row = await db
    .prepare("SELECT address, collection_id FROM address_suggestions WHERE id = ? AND status = 'pending'")
    .bind(id)
    .first<{ address: string; collection_id: number | null }>();
  if (!row) return { ok: false, error: 'suggestion not found' };
  if (row.collection_id == null) return { ok: false, error: 'assign a collection before approving' };
  const add = await createAddress(db, row.address, null, row.collection_id);
  if (!add.ok) return { ok: false, error: add.error ?? 'could not add address' };
  await setSuggestionStatus(db, id, 'approved');
  return { ok: true };
}
