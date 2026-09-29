import type {
  Address,
  ChatMessage,
  ChatParticipant,
  CollectionWithStats,
  Message,
  MessageOp,
  ProtocolStat,
  TickStat,
} from './types';
import { COUNT_ONLY_PROTOCOLS, type DecodedOp } from './protocols';
import { sha256 } from './address';

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

function nullableNum(row: Record<string, unknown>, key: string): number | null {
  const v = row[key];
  return v == null ? null : num(row, key);
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Key of the "same content to the same address" collapse group. Content
 * takes precedence; opaque payloads fall back to their hex.
 */
export function contentHash(content: string | null, payloadHex?: string | null): string {
  const src = content && content.trim().length ? content.trim() : `hex:${payloadHex ?? ''}`;
  const digest = sha256(new TextEncoder().encode(src));
  let hex = '';
  for (let i = 0; i < 16; i++) hex += digest[i].toString(16).padStart(2, '0');
  return hex;
}

// ---------------------------------------------------------------------------
// Collections & addresses
// ---------------------------------------------------------------------------

export async function listCollections(db: D1Database): Promise<CollectionWithStats[]> {
  const { results } = await db
    .prepare(
      `SELECT c.id, c.name, c.description, c.slug, c.created_at,
              (SELECT COUNT(*) FROM addresses a WHERE a.collection_id = c.id) AS address_count,
              (SELECT COUNT(*) FROM messages m
                 JOIN addresses a ON a.address = m.monitored_address
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
  /** Unix time of the newest row, for sitemap lastmod. */
  last_ts?: number | null;
  category: string;
  count: number;
}

export async function listCategories(db: D1Database): Promise<CategoryStat[]> {
  const { results } = await db
    .prepare(
      `SELECT m.category AS category, COUNT(*) AS count, MAX(m.ts) AS last_ts
         FROM messages m
        WHERE m.category IS NOT NULL AND m.category != '' AND (m.protocol = 'text' OR m.protocol IS NULL)
        GROUP BY m.category
        ORDER BY count DESC, category ASC`
    )
    .all<Record<string, unknown>>();

  return results.map((r) => ({
    category: str(r, 'category'),
    count: num(r, 'count'),
    last_ts: nullableNum(r, 'last_ts'),
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

// ---------------------------------------------------------------------------
// Protocol / tick statistics
// ---------------------------------------------------------------------------

/** Distinct txs per protocol; `days` = 0 means all time (the default for the explorer index). */
export async function listProtocols(db: D1Database, days = 0): Promise<ProtocolStat[]> {
  const since = days > 0 ? nowSeconds() - days * 86400 : 0;
  const { results } = await db
    .prepare(
      `SELECT protocol, COUNT(DISTINCT txid) AS count, MAX(ts) AS last_ts
         FROM ops
        WHERE ts >= ?
        GROUP BY protocol
        ORDER BY count DESC, protocol ASC`
    )
    .bind(since)
    .all<Record<string, unknown>>();
  return results.map((r) => ({ protocol: str(r, 'protocol'), count: num(r, 'count'), last_ts: nullableNum(r, 'last_ts') }));
}

export async function listTicks(db: D1Database, protocol?: string, days = 0, limit = 100): Promise<TickStat[]> {
  const since = days > 0 ? nowSeconds() - days * 86400 : 0;
  const params: unknown[] = [since];
  let where = 'WHERE ts >= ? AND tick IS NOT NULL';
  if (protocol) {
    where += ' AND protocol = ?';
    params.push(protocol);
  }
  params.push(limit);
  const { results } = await db
    .prepare(
      `SELECT protocol, tick, COUNT(DISTINCT txid) AS count, MAX(ts) AS last_ts
         FROM ops
         ${where}
        GROUP BY protocol, tick
        ORDER BY count DESC, tick ASC
        LIMIT ?`
    )
    .bind(...params)
    .all<Record<string, unknown>>();
  return results.map((r) => ({ protocol: str(r, 'protocol'), tick: str(r, 'tick'), count: num(r, 'count'), last_ts: nullableNum(r, 'last_ts') }));
}

// ---------------------------------------------------------------------------
// Feed
// ---------------------------------------------------------------------------

export interface GetMessagesOpts {
  collectionId?: number;
  address?: string;
  category?: string;
  /** Filter by protocol slug; matches any op of the tx (via the ops table). */
  protocol?: string;
  /** Filter by token ticker (any protocol unless `protocol` is also given). */
  tick?: string;
  /** 'text' = human messages only (default for the global feed); 'all' = every stored protocol. */
  kind?: 'text' | 'all';
  /** Only rows mined in this block. */
  blockHeight?: number;
  sort: 'hot' | 'new';
  limit: number;
  /** Opaque keyset cursor from a previous page's next_before ("likes:ts:id"). */
  before?: string;
}

function encodeCursor(m: { likes: number; ts: number; id: number }): string {
  return `${m.likes}:${m.ts}:${m.id}`;
}

function decodeCursor(raw: string): { likes: number; ts: number; id: number } | null {
  const parts = raw.split(':').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  return { likes: parts[0], ts: parts[1], id: parts[2] };
}

const MESSAGE_COLUMNS = `m.id, m.txid, m.address, m.content, m.category, m.likes, m.is_mempool, m.created_at,
                m.block_time, m.fee_sats, m.fee_rate, m.sender, m.protocol, m.recipient, m.monitored_address,
                m.block_height, m.ts, m.dup_count, a.collection_id`;

function mapFeedRow(r: Record<string, unknown>): Message {
  return {
    id: num(r, 'id'),
    txid: str(r, 'txid'),
    address: str(r, 'address'),
    content: nullableStr(r, 'content'),
    category: nullableStr(r, 'category'),
    likes: num(r, 'likes'),
    is_mempool: num(r, 'is_mempool'),
    created_at: str(r, 'created_at'),
    block_time: nullableNum(r, 'block_time'),
    raw_hex: null,
    fee_sats: nullableNum(r, 'fee_sats'),
    fee_rate: nullableNum(r, 'fee_rate'),
    collection_id: nullableNum(r, 'collection_id'),
    dup_count: num(r, 'dup_count') || 1,
    sender: nullableStr(r, 'sender'),
    protocol: nullableStr(r, 'protocol'),
    recipient: nullableStr(r, 'recipient'),
    monitored_address: nullableStr(r, 'monitored_address'),
    block_height: nullableNum(r, 'block_height'),
    is_dup: r.is_dup == null ? undefined : num(r, 'is_dup'),
  };
}

/** txid of the representative row of this row's collapse group (itself when not a dup). */
export async function getRepresentativeTxid(db: D1Database, id: number): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT r.txid AS txid FROM messages m
         JOIN messages r ON r.address = m.address AND r.content_hash = m.content_hash AND r.is_dup = 0
        WHERE m.id = ? ORDER BY r.ts DESC, r.id DESC LIMIT 1`
    )
    .bind(id)
    .first<{ txid: string }>();
  return row?.txid ?? null;
}

/** WHERE fragments shared by the feed and chat queries. */
function messageFilters(opts: {
  collectionId?: number;
  address?: string;
  category?: string;
  kind?: 'text' | 'all';
  blockHeight?: number;
}): {
  where: string[];
  params: unknown[];
} {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.collectionId) {
    where.push('m.monitored_address IN (SELECT address FROM addresses WHERE collection_id = ?)');
    params.push(opts.collectionId);
  }
  if (opts.address) {
    where.push('(m.address = ? OR m.recipient = ? OR m.sender = ?)');
    params.push(opts.address, opts.address, opts.address);
  }
  if (opts.category) {
    where.push('m.category = ?');
    params.push(opts.category);
  }
  if (opts.kind === 'text') {
    where.push("m.protocol = 'text'");
  }
  if (opts.blockHeight != null) {
    where.push('m.block_height = ?');
    params.push(opts.blockHeight);
  }
  return { where, params };
}

/**
 * Feed page. Dedupe is precomputed (is_dup / dup_count, see recomputeGroups)
 * so this is a plain keyset query over an index; pages never skip or repeat.
 *
 * Without a protocol/tick filter the query walks `messages` directly. With
 * one it walks `ops` (indexed by protocol/tick and time) and joins each tx,
 * so a tx carrying both an ico-20 transfer and a crc-20 mint is reachable
 * from either protocol page.
 */
export async function getMessages(
  db: D1Database,
  opts: GetMessagesOpts
): Promise<{ messages: Message[]; next_before: string | null }> {
  const viaOps = Boolean(opts.protocol || opts.tick);
  if (!viaOps && (opts.collectionId || opts.address)) return getMessagesByBranches(db, opts);

  const { where, params } = messageFilters(opts);
  where.unshift('m.is_dup = 0');
  const cur = opts.before ? decodeCursor(opts.before) : null;

  // Driving row for ordering + cursor: the op row when filtering by protocol/tick.
  const tsCol = viaOps ? 'o.ts' : 'm.ts';
  const idCol = viaOps ? 'o.id' : 'm.id';

  if (viaOps) {
    if (opts.protocol) {
      where.push('o.protocol = ?');
      params.push(opts.protocol);
    }
    if (opts.tick) {
      where.push('o.tick = ?');
      params.push(opts.tick);
    }
  }
  if (cur) {
    const timeKey = `(${tsCol} < ? OR (${tsCol} = ? AND ${idCol} < ?))`;
    if (opts.sort === 'hot') {
      where.push(`(m.likes < ? OR (m.likes = ? AND ${timeKey}))`);
      params.push(cur.likes, cur.likes, cur.ts, cur.ts, cur.id);
    } else {
      where.push(timeKey);
      params.push(cur.ts, cur.ts, cur.id);
    }
  }

  const order =
    opts.sort === 'hot' ? `m.likes DESC, ${tsCol} DESC, ${idCol} DESC` : `${tsCol} DESC, ${idCol} DESC`;
  // A tx with two ops of the same protocol yields two op rows; over-fetch a
  // little and collapse by txid below. (A tx whose two matching ops straddle
  // a page boundary can appear on both pages; rare enough to accept.)
  const fetchLimit = viaOps ? opts.limit * 2 : opts.limit;
  params.push(fetchLimit);

  const from = viaOps
    ? 'FROM ops o JOIN messages m ON m.txid = o.txid LEFT JOIN addresses a ON a.address = m.monitored_address'
    : 'FROM messages m LEFT JOIN addresses a ON a.address = m.monitored_address';

  const { results } = await db
    .prepare(
      `SELECT ${MESSAGE_COLUMNS}, ${tsCol} AS cur_ts, ${idCol} AS cur_id
         ${from}
        WHERE ${where.join(' AND ')}
        ORDER BY ${order}
        LIMIT ?`
    )
    .bind(...params)
    .all<Record<string, unknown>>();

  const seen = new Set<string>();
  const messages: Message[] = [];
  let last: Record<string, unknown> | null = null;
  for (const r of results) {
    last = r;
    const txid = str(r, 'txid');
    if (seen.has(txid)) continue;
    seen.add(txid);
    messages.push(mapFeedRow(r));
    if (messages.length >= opts.limit) break;
  }

  let next_before: string | null = null;
  if (last && (messages.length >= opts.limit || results.length >= fetchLimit)) {
    next_before = encodeCursor({ likes: num(last, 'likes'), ts: num(last, 'cur_ts'), id: num(last, 'cur_id') });
  }
  return { messages, next_before };
}

/**
 * Collection and address feeds. SQLite prefers walking the global time index
 * and filtering, which degrades into a table scan when the wanted rows are
 * rare (a collection is a few thousand rows out of hundreds of thousands).
 * So each monitored address — or each of address / recipient / sender —
 * becomes its own indexed, ordered, limited branch; the union of at most
 * branches × limit rows is then sorted and cut.
 */
async function getMessagesByBranches(
  db: D1Database,
  opts: GetMessagesOpts
): Promise<{ messages: Message[]; next_before: string | null }> {
  const cur = opts.before ? decodeCursor(opts.before) : null;
  const baseWhere: string[] = ['m.is_dup = 0'];
  const baseParams: unknown[] = [];
  if (opts.category) {
    baseWhere.push('m.category = ?');
    baseParams.push(opts.category);
  }
  if (opts.kind === 'text') baseWhere.push("m.protocol = 'text'");
  if (opts.blockHeight != null) {
    baseWhere.push('m.block_height = ?');
    baseParams.push(opts.blockHeight);
  }
  if (cur) {
    const timeKey = '(m.ts < ? OR (m.ts = ? AND m.id < ?))';
    if (opts.sort === 'hot') {
      baseWhere.push(`(m.likes < ? OR (m.likes = ? AND ${timeKey}))`);
      baseParams.push(cur.likes, cur.likes, cur.ts, cur.ts, cur.id);
    } else {
      baseWhere.push(timeKey);
      baseParams.push(cur.ts, cur.ts, cur.id);
    }
  }
  const order = opts.sort === 'hot' ? 'likes DESC, ts DESC, id DESC' : 'ts DESC, id DESC';

  // One branch per indexed column value.
  const branches: Array<{ col: string; value: string }> = [];
  if (opts.collectionId) {
    const { results } = await db
      .prepare('SELECT address FROM addresses WHERE collection_id = ?')
      .bind(opts.collectionId)
      .all<{ address: string }>();
    for (const r of results) branches.push({ col: 'm.monitored_address', value: r.address });
    if (opts.address) branches.length = 0; // address wins; see below
  }
  if (opts.address) {
    for (const col of ['m.address', 'm.recipient', 'm.sender']) branches.push({ col, value: opts.address });
  }
  if (branches.length === 0) return { messages: [], next_before: null };

  // One statement per branch, all in a single batch: production D1 caps the
  // number of terms in a compound SELECT, so UNION ALL is not an option for a
  // collection with many addresses. Each statement is an indexed, ordered,
  // limited lookup; the merge happens here.
  const stmts = branches.map((b) =>
    db
      .prepare(
        `SELECT ${MESSAGE_COLUMNS}, m.ts AS cur_ts, m.id AS cur_id
           FROM messages m LEFT JOIN addresses a ON a.address = m.monitored_address
          WHERE ${b.col} = ? AND ${baseWhere.join(' AND ')}
          ORDER BY m.${order.replace(/, /g, ', m.')} LIMIT ?`
      )
      .bind(b.value, ...baseParams, opts.limit)
  );
  const results: Record<string, unknown>[] = [];
  for (let i = 0; i < stmts.length; i += 20) {
    const res = await db.batch<Record<string, unknown>>(stmts.slice(i, i + 20));
    for (const r of res) results.push(...r.results);
  }
  const key = (r: Record<string, unknown>) => [num(r, 'likes'), num(r, 'cur_ts'), num(r, 'cur_id')];
  results.sort((x, y) => {
    const a = key(x);
    const b = key(y);
    if (opts.sort === 'hot' && a[0] !== b[0]) return b[0] - a[0];
    return b[1] - a[1] || b[2] - a[2];
  });

  const seen = new Set<number>();
  const messages: Message[] = [];
  let last: Record<string, unknown> | null = null;
  for (const r of results) {
    const id = num(r, 'id');
    if (seen.has(id)) continue;
    seen.add(id);
    last = r;
    messages.push(mapFeedRow(r));
    if (messages.length >= opts.limit) break;
  }
  let next_before: string | null = null;
  if (last && messages.length >= opts.limit) {
    next_before = encodeCursor({ likes: num(last, 'likes'), ts: num(last, 'cur_ts'), id: num(last, 'cur_id') });
  }
  return { messages, next_before };
}

// ---------------------------------------------------------------------------
// Chat view
// ---------------------------------------------------------------------------

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
 *
 * The window runs over one room's rows only (bounded by the monitored /
 * address indexes), never over the whole table.
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

  const f = messageFilters({ collectionId: opts.collectionId, address: opts.address });
  params.push(...f.params);
  const where = f.where.length ? 'WHERE ' + f.where.join(' AND ') : '';

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
           SELECT ${MESSAGE_COLUMNS},
                  (${partySql}) AS is_party,
                  COUNT(*) OVER (PARTITION BY COALESCE(m.sender, ''), COALESCE(m.content_hash, m.txid)) AS group_count,
                  ROW_NUMBER() OVER (PARTITION BY COALESCE(m.sender, ''), COALESCE(m.content_hash, m.txid)
                                     ORDER BY m.ts DESC, m.id DESC) AS rn
             FROM messages m
             LEFT JOIN addresses a ON a.address = m.monitored_address
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
      ...mapFeedRow(r),
      sender: nullableStr(r, 'sender'),
      // A party's repeated turns are kept as separate bubbles, so don't badge them.
      dup_count: num(r, 'is_party') ? 1 : num(r, 'group_count'),
    }))
    .reverse();

  let next_before: string | null = null;
  if (hasMore) {
    const oldest = rows[rows.length - 1];
    next_before = `${num(oldest, 'ts')}:${num(oldest, 'id')}`;
  }
  return { participants: partRes.results, messages, next_before };
}

// ---------------------------------------------------------------------------
// Single message
// ---------------------------------------------------------------------------

function mapMessage(row: Record<string, unknown>): Message {
  return {
    ...mapFeedRow(row),
    raw_hex: nullableStr(row, 'raw_hex'),
  };
}

const SELECT_MESSAGE = `
  SELECT m.*, a.collection_id
    FROM messages m
    LEFT JOIN addresses a ON a.address = m.monitored_address
   WHERE `;

function mapOp(r: Record<string, unknown>): MessageOp {
  return {
    vout: num(r, 'vout'),
    protocol: str(r, 'protocol'),
    op: nullableStr(r, 'op'),
    tick: nullableStr(r, 'tick'),
    amount: nullableStr(r, 'amount'),
    payload_hex: nullableStr(r, 'payload_hex'),
  };
}

export async function listOps(db: D1Database, txid: string): Promise<MessageOp[]> {
  const { results } = await db
    .prepare('SELECT vout, protocol, op, tick, amount, payload_hex FROM ops WHERE txid = ? ORDER BY vout ASC')
    .bind(txid)
    .all<Record<string, unknown>>();
  return results.map(mapOp);
}

export async function countMessagesForAddress(db: D1Database, address: string): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM (
         SELECT id FROM messages WHERE address = ?
         UNION SELECT id FROM messages WHERE recipient = ?
         UNION SELECT id FROM messages WHERE sender = ?
       )`
    )
    .bind(address, address, address)
    .first<{ n: number }>();
  return row ? Number(row.n) : 0;
}

export async function getMessage(db: D1Database, id: number): Promise<Message | null> {
  const row = await db.prepare(SELECT_MESSAGE + 'm.id = ?').bind(id).first<Record<string, unknown>>();
  if (!row) return null;
  const msg = mapMessage(row);
  msg.ops = await listOps(db, msg.txid);
  return msg;
}

export async function getMessageByTxid(db: D1Database, txid: string): Promise<Message | null> {
  const row = await db.prepare(SELECT_MESSAGE + 'm.txid = ?').bind(txid).first<Record<string, unknown>>();
  if (!row) return null;
  const msg = mapMessage(row);
  msg.ops = await listOps(db, msg.txid);
  return msg;
}

// ---------------------------------------------------------------------------
// Inserts, dedupe groups, backfills
// ---------------------------------------------------------------------------

export interface NewMessage {
  txid: string;
  /** Filing address: monitored address (poll path) or recipient (block path); '' if neither. */
  address: string;
  content: string | null;
  raw_hex: string | null;
  is_mempool: boolean;
  fee_sats: number | null;
  fee_rate: number | null;
  block_time: number | null;
  block_height: number | null;
  sender: string | null;
  protocol: string;
  recipient: string | null;
  monitored_address: string | null;
  content_hash: string;
  ops: DecodedOp[];
}

export interface GroupKey {
  address: string;
  content_hash: string;
}

/** Statements that write one message + its ops (no dedupe yet). */
export function insertMessageStatements(db: D1Database, msg: NewMessage): D1PreparedStatement[] {
  const ts = msg.block_time ?? nowSeconds();
  const stmts: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT OR IGNORE INTO messages
           (txid, address, content, is_mempool, raw_hex, fee_sats, fee_rate, block_time, block_height, sender,
            protocol, recipient, monitored_address, content_hash, ts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        msg.block_height,
        msg.sender,
        msg.protocol,
        msg.recipient,
        msg.monitored_address,
        msg.content_hash,
        ts
      ),
  ];
  // Runes / opaque payloads are census-only: they never become ops rows, so
  // /api/protocols cannot grow a "Runes" entry from the rare tx that mixes a
  // runestone with a storable op.
  for (const op of msg.ops) if (!COUNT_ONLY_PROTOCOLS.has(op.protocol)) stmts.push(insertOpStatement(db, msg.txid, op, ts));
  return stmts;
}

export function insertOpStatement(db: D1Database, txid: string, op: DecodedOp, ts: number): D1PreparedStatement {
  return db
    .prepare(
      `INSERT OR IGNORE INTO ops (txid, vout, protocol, op, tick, amount, payload_hex, ts)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(txid, op.vout, op.protocol, op.op, op.tick, op.amount, op.payload_hex || null, ts);
}

/**
 * Insert a message with its ops and settle its dedupe group. Returns true if
 * the row was new (txid was unique), false if it already existed — in which
 * case only NULL attribution/chain fields are filled in.
 */
export async function insertMessage(db: D1Database, msg: NewMessage): Promise<boolean> {
  const stmts = insertMessageStatements(db, msg);
  const [first] = await db.batch(stmts);
  const inserted = first.meta.changes > 0;
  if (inserted) {
    await recomputeGroups(db, [{ address: msg.address, content_hash: msg.content_hash }]);
  } else {
    await adoptExisting(db, msg);
  }
  return inserted;
}

/** The poll path re-sees a tx block ingestion already stored: attribute and fill blanks. */
async function adoptExisting(db: D1Database, msg: NewMessage): Promise<void> {
  const stmts: D1PreparedStatement[] = [];
  if (msg.monitored_address) {
    stmts.push(
      db
        .prepare('UPDATE messages SET monitored_address = ? WHERE txid = ? AND monitored_address IS NULL')
        .bind(msg.monitored_address, msg.txid)
    );
  }
  stmts.push(
    db
      .prepare(
        `UPDATE messages
            SET sender = COALESCE(sender, ?),
                recipient = COALESCE(recipient, ?),
                fee_sats = COALESCE(fee_sats, ?),
                fee_rate = COALESCE(fee_rate, ?),
                block_height = COALESCE(block_height, ?)
          WHERE txid = ?`
      )
      .bind(msg.sender, msg.recipient, msg.fee_sats, msg.fee_rate, msg.block_height, msg.txid)
  );
  if (!msg.is_mempool) stmts.push(confirmStatement(db, msg.txid, msg.block_time, msg.block_height));
  await db.batch(stmts);
  // A sender that just became known may be a monitored party, which changes
  // whether this row may be collapsed; settle its group.
  if (msg.sender) await recomputeGroups(db, await groupsForTxids(db, [msg.txid]));
}

/**
 * Re-derive the representative row and dup_count of each (address,
 * content_hash) group from scratch. Idempotent: running it twice yields the
 * same result, so retries, reorg re-scans and backfills cannot drift.
 *
 * Rows written by a monitored party (sender is a monitored address) are
 * never collapsed: a hacker saying "yes" twice is two real turns.
 */
export async function recomputeGroups(db: D1Database, groups: GroupKey[]): Promise<void> {
  const uniq = new Map<string, GroupKey>();
  for (const g of groups) if (g.content_hash) uniq.set(`${g.address}\u0000${g.content_hash}`, g);
  if (uniq.size === 0) return;

  const stmts: D1PreparedStatement[] = [];
  for (const g of uniq.values()) {
    const { results } = await db
      .prepare(
        `SELECT m.id, m.is_dup, m.dup_count,
                EXISTS (SELECT 1 FROM addresses p WHERE p.address = m.sender) AS is_party
           FROM messages m
          WHERE m.address = ? AND m.content_hash = ?
          ORDER BY m.ts DESC, m.id DESC`
      )
      .bind(g.address, g.content_hash)
      .all<{ id: number; is_dup: number; dup_count: number; is_party: number }>();
    if (results.length === 0) continue;

    const anon = results.filter((r) => !r.is_party);
    const desired = new Map<number, { is_dup: number; dup_count: number }>();
    for (const r of results) desired.set(r.id, { is_dup: 0, dup_count: 1 });
    anon.forEach((r, i) => desired.set(r.id, { is_dup: i === 0 ? 0 : 1, dup_count: i === 0 ? anon.length : 1 }));

    for (const r of results) {
      const d = desired.get(r.id)!;
      if (d.is_dup !== r.is_dup || d.dup_count !== r.dup_count) {
        stmts.push(db.prepare('UPDATE messages SET is_dup = ?, dup_count = ? WHERE id = ?').bind(d.is_dup, d.dup_count, r.id));
      }
    }
  }
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
}

/** Group keys of the given txids (for recompute after deletes / attribution changes). */
export async function groupsForTxids(db: D1Database, txids: string[]): Promise<GroupKey[]> {
  const out: GroupKey[] = [];
  for (let i = 0; i < txids.length; i += 90) {
    const chunk = txids.slice(i, i + 90);
    const { results } = await db
      .prepare(`SELECT address, content_hash FROM messages WHERE txid IN (${chunk.map(() => '?').join(',')})`)
      .bind(...chunk)
      .all<{ address: string; content_hash: string | null }>();
    for (const r of results) if (r.content_hash) out.push({ address: r.address, content_hash: r.content_hash });
  }
  return out;
}

function confirmStatement(db: D1Database, txid: string, blockTime: number | null, blockHeight: number | null): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE messages
          SET is_mempool = 0,
              block_time = COALESCE(block_time, ?),
              block_height = COALESCE(block_height, ?),
              ts = COALESCE(block_time, ?, ts)
        WHERE txid = ? AND (is_mempool = 1 OR block_height IS NULL)`
    )
    .bind(blockTime, blockHeight, blockTime, txid);
}

/** Repair rows stuck as mempool even though a confirmation time was recorded. */
export async function repairConfirmedFlags(db: D1Database): Promise<number> {
  const res = await db
    .prepare('UPDATE messages SET is_mempool = 0, ts = block_time WHERE is_mempool = 1 AND block_time IS NOT NULL')
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
  const { results } = await db
    .prepare(
      `SELECT txid, address, content_hash FROM messages
        WHERE monitored_address = ? AND is_mempool = 1 AND block_time IS NULL${notIn}`
    )
    .bind(address, ...liveMempoolTxids)
    .all<{ txid: string; address: string; content_hash: string | null }>();
  if (results.length === 0) return 0;
  await deleteByTxids(db, results.map((r) => r.txid));
  await recomputeGroups(
    db,
    results.filter((r) => r.content_hash).map((r) => ({ address: r.address, content_hash: r.content_hash as string }))
  );
  return results.length;
}

/** Delete messages + ops (+ votes) for a set of txids. */
export async function deleteByTxids(db: D1Database, txids: string[]): Promise<void> {
  for (let i = 0; i < txids.length; i += 90) {
    const chunk = txids.slice(i, i + 90);
    const marks = chunk.map(() => '?').join(',');
    await db.batch([
      db.prepare(`DELETE FROM votes WHERE message_id IN (SELECT id FROM messages WHERE txid IN (${marks}))`).bind(...chunk),
      db.prepare(`DELETE FROM ops WHERE txid IN (${marks})`).bind(...chunk),
      db.prepare(`DELETE FROM messages WHERE txid IN (${marks})`).bind(...chunk),
    ]);
  }
}

// ---- legacy reparse -------------------------------------------------------

export interface ReparseRow {
  id: number;
  txid: string;
  address: string;
  content: string | null;
  ts: number;
  /** Current protocol; null for rows the registry has never seen. */
  protocol?: string | null;
}

/** Rows stored before the protocol registry existed, oldest first. */
export async function listMessagesNeedingReparse(db: D1Database, limit: number): Promise<ReparseRow[]> {
  const { results } = await db
    .prepare('SELECT id, txid, address, content, ts FROM messages WHERE protocol IS NULL ORDER BY id ASC LIMIT ?')
    .bind(limit)
    .all<Record<string, unknown>>();
  return results.map((r) => ({
    id: num(r, 'id'),
    txid: str(r, 'txid'),
    address: str(r, 'address'),
    content: nullableStr(r, 'content'),
    ts: num(r, 'ts'),
  }));
}

/** Rows filed as text, or never parsed, keyset-paged, for re-running newer detectors over them. */
export async function listTextRowsForReparse(db: D1Database, after: number, limit: number): Promise<ReparseRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, txid, address, content, ts, protocol FROM messages
        WHERE id > ? AND (protocol = 'text' OR protocol IS NULL) ORDER BY id ASC LIMIT ?`
    )
    .bind(after, limit)
    .all<Record<string, unknown>>();
  return results.map((r) => ({
    id: num(r, 'id'),
    txid: str(r, 'txid'),
    address: str(r, 'address'),
    content: nullableStr(r, 'content'),
    ts: num(r, 'ts'),
    protocol: nullableStr(r, 'protocol'),
  }));
}

/**
 * Write a reparse result. Count-only protocols (binary, runes) never get ops
 * rows, so they stay out of /protocols exactly like freshly ingested blocks.
 * With `replace`, the row's previous ops are removed first so a text -> pwt
 * transition does not leave a stale text op behind; when the new ops line up
 * one-to-one with the old ones, the original vout and payload hex are kept.
 */
export async function applyReparse(
  db: D1Database,
  row: ReparseRow,
  protocol: string,
  hash: string,
  ops: DecodedOp[],
  replace = false
): Promise<void> {
  // A row that stops being text also stops being a human message: drop its label.
  const stmts: D1PreparedStatement[] = [
    protocol === 'text'
      ? db.prepare('UPDATE messages SET protocol = ?, content_hash = ? WHERE id = ?').bind(protocol, hash, row.id)
      : db.prepare('UPDATE messages SET protocol = ?, content_hash = ?, category = NULL WHERE id = ?').bind(protocol, hash, row.id),
  ];
  let toInsert = ops.filter((op) => !COUNT_ONLY_PROTOCOLS.has(op.protocol));
  if (replace) {
    const { results: old } = await db
      .prepare('SELECT vout, payload_hex FROM ops WHERE txid = ? ORDER BY vout ASC, id ASC')
      .bind(row.txid)
      .all<{ vout: number; payload_hex: string | null }>();
    if (old.length === toInsert.length) {
      toInsert = toInsert.map((op, i) => ({ ...op, vout: old[i].vout, payload_hex: op.payload_hex || old[i].payload_hex || '' }));
    }
    stmts.push(db.prepare('DELETE FROM ops WHERE txid = ?').bind(row.txid));
  }
  for (const op of toInsert) stmts.push(insertOpStatement(db, row.txid, op, row.ts));
  await db.batch(stmts);
}

export interface TagGroup {
  address: string;
  content_hash: string;
  content: string;
  n: number;
}

/**
 * Dedupe groups of text rows whose content is one short token repeated at
 * least `min` times to the same address. Those are markers, not messages.
 */
export async function listFrequentTokenGroups(db: D1Database, min: number, limit = 50): Promise<TagGroup[]> {
  const { results } = await db
    .prepare(
      `SELECT address, content_hash, MIN(content) AS content, COUNT(*) AS n FROM messages
        WHERE protocol = 'text' AND content_hash IS NOT NULL
          AND length(content) BETWEEN 2 AND 12 AND content NOT LIKE '% %' AND content NOT LIKE '%' || char(10) || '%'
        GROUP BY address, content_hash HAVING n >= ?
        ORDER BY n DESC LIMIT ?`
    )
    .bind(min, limit)
    .all<Record<string, unknown>>();
  return results
    .map((r) => ({ address: str(r, 'address'), content_hash: str(r, 'content_hash'), content: str(r, 'content'), n: num(r, 'n') }))
    // Inscription-like only: a digit or at least two capitals. A repeated lowercase
    // word ("hello", "thanks") is a popular message, not a marker; the fixed
    // TAG_WORDS list covers the few lowercase markers we know.
    .filter((g) => /^(?=.*(?:\d|[A-Z].*[A-Z]))[A-Za-z0-9_$#-]{2,12}$/.test(g.content.trim()));
}

/** Undo convertGroupToTag for one token: every `tag` row carrying it goes back to text (unlabelled). */
export async function untag(db: D1Database, tag: string): Promise<number> {
  const res = await db.batch([
    db.prepare(`UPDATE ops SET protocol = 'text', op = NULL WHERE protocol = 'tag' AND op = ?`).bind(tag),
    db.prepare(`UPDATE messages SET protocol = 'text' WHERE protocol = 'tag' AND trim(content) = ?`).bind(tag),
  ]);
  return Number(res[1]?.meta?.changes ?? 0);
}

/** Turn every row of a group into a `tag` protocol row (ops rewritten, labels cleared). */
export async function convertGroupToTag(db: D1Database, g: TagGroup): Promise<number> {
  const tag = g.content.trim();
  const res = await db.batch([
    db
      .prepare(`UPDATE ops SET protocol = 'tag', op = ?, tick = NULL, amount = NULL WHERE txid IN (SELECT txid FROM messages WHERE address = ? AND content_hash = ? AND protocol = 'text')`)
      .bind(tag, g.address, g.content_hash),
    db
      .prepare(`UPDATE messages SET protocol = 'tag', category = NULL WHERE address = ? AND content_hash = ? AND protocol = 'text'`)
      .bind(g.address, g.content_hash),
  ]);
  return Number(res[1]?.meta?.changes ?? 0);
}

// ---- per-txid detail backfill --------------------------------------------

export interface DetailRow {
  txid: string;
  address: string;
  content_hash: string | null;
}

/**
 * Rows still missing sender, recipient or fee — data only the tx-detail
 * endpoint has. Text rows first (they are what people read), newest first.
 */
export async function listMessagesNeedingDetail(db: D1Database, limit: number): Promise<DetailRow[]> {
  const base = `SELECT txid, address, content_hash FROM messages
        WHERE detail_tries < 3 AND (sender IS NULL OR recipient IS NULL OR fee_sats IS NULL)`;
  const rows: DetailRow[] = [];
  // Two bounded passes so each walks the partial index in id order instead of sorting the backlog.
  for (const cond of ["AND protocol = 'text'", "AND (protocol IS NULL OR protocol != 'text')"]) {
    if (rows.length >= limit) break;
    const { results } = await db
      .prepare(`${base} ${cond} ORDER BY id DESC LIMIT ?`)
      .bind(limit - rows.length)
      .all<Record<string, unknown>>();
    for (const r of results) rows.push({ txid: str(r, 'txid'), address: str(r, 'address'), content_hash: nullableStr(r, 'content_hash') });
  }
  return rows;
}

export interface TxDetail {
  sender: string | null;
  recipient: string | null;
  fee_sats: number | null;
  fee_rate: number | null;
  block_time: number | null;
  block_height: number | null;
}

/** Apply a tx-detail fetch. Also attributes the row when sender/recipient is monitored. */
export async function applyDetail(db: D1Database, txid: string, d: TxDetail): Promise<void> {
  await db.batch([
    db
      .prepare(
        `UPDATE messages
            SET sender = COALESCE(sender, ?),
                recipient = COALESCE(recipient, ?),
                fee_sats = COALESCE(fee_sats, ?),
                fee_rate = COALESCE(fee_rate, ?),
                block_time = COALESCE(block_time, ?),
                block_height = COALESCE(block_height, ?),
                ts = COALESCE(block_time, ?, ts),
                is_mempool = CASE WHEN COALESCE(block_time, ?) IS NOT NULL THEN 0 ELSE is_mempool END,
                detail_tries = detail_tries + 1
          WHERE txid = ?`
      )
      .bind(d.sender, d.recipient, d.fee_sats, d.fee_rate, d.block_time, d.block_height, d.block_time, d.block_time, txid),
    db.prepare('UPDATE ops SET ts = (SELECT ts FROM messages WHERE txid = ?) WHERE txid = ?').bind(txid, txid),
    db
      .prepare(
        `UPDATE messages
            SET monitored_address = COALESCE(
                  monitored_address,
                  (SELECT address FROM addresses WHERE address = messages.recipient),
                  (SELECT address FROM addresses WHERE address = messages.sender))
          WHERE txid = ?`
      )
      .bind(txid),
  ]);
}

export async function bumpDetailTries(db: D1Database, txid: string): Promise<void> {
  await db.prepare('UPDATE messages SET detail_tries = detail_tries + 1 WHERE txid = ?').bind(txid).run();
}

/**
 * Attribute rows that touch a monitored address but were filed by block
 * ingestion before the address was known (or added later). One indexed
 * UPDATE per monitored address, so cost does not grow with the table.
 */
export async function reconcileMonitored(db: D1Database): Promise<number> {
  const addrs = await listAddresses(db);
  if (addrs.length === 0) return 0;
  const stmts: D1PreparedStatement[] = [];
  for (const a of addrs) {
    stmts.push(
      db
        .prepare('UPDATE messages SET monitored_address = ? WHERE monitored_address IS NULL AND recipient = ?')
        .bind(a.address, a.address),
      db
        .prepare('UPDATE messages SET monitored_address = ? WHERE monitored_address IS NULL AND sender = ?')
        .bind(a.address, a.address)
    );
  }
  let changed = 0;
  for (let i = 0; i < stmts.length; i += 50) {
    const res = await db.batch(stmts.slice(i, i + 50));
    for (const r of res) changed += r.meta.changes;
  }
  return changed;
}

// ---------------------------------------------------------------------------
// Activity dates (sitemap lastmod) and IndexNow bookkeeping
// ---------------------------------------------------------------------------

/** Newest message time per monitored address (bounded by the monitored list; uses idx_messages_monitored). */
export async function monitoredActivity(db: D1Database): Promise<Map<string, number>> {
  const { results } = await db
    .prepare(
      `SELECT monitored_address AS address, MAX(ts) AS last_ts FROM messages
        WHERE monitored_address IN (SELECT address FROM addresses)
        GROUP BY monitored_address`
    )
    .all<{ address: string; last_ts: number }>();
  return new Map(results.map((r) => [r.address, Number(r.last_ts)]));
}

export async function maxMessageId(db: D1Database): Promise<number> {
  const row = await db.prepare('SELECT COALESCE(MAX(id), 0) AS n FROM messages').first<{ n: number }>();
  return Number(row?.n ?? 0);
}

/** Human-message representatives past the bootstrap watermark that the hub has not accepted yet. */
export async function listIndexNowCandidates(db: D1Database, afterId: number, limit: number): Promise<Array<{ id: number; txid: string; monitored_address: string | null }>> {
  const { results } = await db
    .prepare(
      `SELECT id, txid, monitored_address FROM messages
        WHERE indexnow_pushed_at IS NULL AND protocol = 'text' AND is_dup = 0 AND id > ?
        ORDER BY id ASC LIMIT ?`
    )
    .bind(afterId, limit)
    .all<Record<string, unknown>>();
  return results.map((r) => ({ id: num(r, 'id'), txid: str(r, 'txid'), monitored_address: nullableStr(r, 'monitored_address') }));
}

export async function markIndexNowPushed(db: D1Database, ids: number[], at: number): Promise<void> {
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    await db
      .prepare(`UPDATE messages SET indexnow_pushed_at = ? WHERE id IN (${chunk.map(() => '?').join(',')})`)
      .bind(at, ...chunk)
      .run();
  }
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/** Human-text group representatives the AI has not seen yet. Protocol rows and collapsed duplicates never qualify; duplicates inherit via setCategoryForGroup. */
export async function getUnclassifiedMessages(db: D1Database, limit: number): Promise<Message[]> {
  const { results } = await db
    .prepare(
      `SELECT id, txid, address, content FROM messages
        WHERE category IS NULL AND (protocol = 'text' OR protocol IS NULL) AND is_dup = 0
          AND content IS NOT NULL AND length(trim(content)) > 0
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

export interface CategoryAssignment {
  id: number;
  /** null clears the category (used to revert a reclassification run). */
  category: string | null;
}

/**
 * Statements that set a row's category and copy it onto the collapsed
 * duplicates of its dedupe group (same address + content_hash, is_dup = 1).
 * Rows without a content_hash get the single-row update only.
 */
export function categoryStatements(
  db: D1Database,
  a: CategoryAssignment,
  key: { address: string; content_hash: string | null }
): D1PreparedStatement[] {
  const stmts = [db.prepare('UPDATE messages SET category = ? WHERE id = ?').bind(a.category, a.id)];
  if (key.content_hash) {
    stmts.push(
      db
        .prepare('UPDATE messages SET category = ? WHERE address = ? AND content_hash = ? AND is_dup = 1')
        .bind(a.category, key.address, key.content_hash)
    );
  }
  return stmts;
}

/**
 * Apply many category assignments. Group keys are looked up first, then the
 * statements run in batches small enough for D1 (<= 50 per batch, <= 100
 * bound parameters). Returns how many rows were addressed directly.
 */
export async function setCategories(db: D1Database, assignments: CategoryAssignment[]): Promise<{ updated: number; propagated: number }> {
  if (assignments.length === 0) return { updated: 0, propagated: 0 };
  const keys = new Map<number, { address: string; content_hash: string | null }>();
  const ids = assignments.map((a) => a.id);
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    const { results } = await db
      .prepare(`SELECT id, address, content_hash FROM messages WHERE id IN (${chunk.map(() => '?').join(',')})`)
      .bind(...chunk)
      .all<{ id: number; address: string; content_hash: string | null }>();
    for (const r of results) keys.set(Number(r.id), { address: r.address, content_hash: r.content_hash });
  }
  const stmts: D1PreparedStatement[] = [];
  const isPropagation: boolean[] = [];
  let updated = 0;
  for (const a of assignments) {
    const key = keys.get(a.id);
    if (!key) continue;
    const s = categoryStatements(db, a, key);
    updated++;
    s.forEach((st, i) => {
      stmts.push(st);
      isPropagation.push(i > 0);
    });
  }
  // `propagated` counts duplicate rows actually rewritten, from D1's change counts.
  let propagated = 0;
  for (let i = 0; i < stmts.length; i += 50) {
    const results = await db.batch(stmts.slice(i, i + 50));
    results.forEach((r, j) => {
      if (isPropagation[i + j]) propagated += Number(r.meta?.changes ?? 0);
    });
  }
  return { updated, propagated };
}

/** Set one row's category and propagate it to its collapsed duplicates. */
export async function setCategoryForGroup(db: D1Database, messageId: number, category: string): Promise<void> {
  await setCategories(db, [{ id: messageId, category }]);
}

export interface TextRow {
  id: number;
  txid: string;
  address: string;
  content: string;
  category: string | null;
  content_hash: string | null;
  ts: number;
}

/**
 * Human-text group representatives, keyset-paged by id, for the offline
 * reclassifier. Rows that are still unparsed (protocol NULL) are included
 * because the cron treats them as text until reparseLegacy runs.
 */
export async function listTextRows(db: D1Database, after: number, limit: number): Promise<TextRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, txid, address, content, category, content_hash, ts FROM messages
        WHERE id > ? AND (protocol = 'text' OR protocol IS NULL) AND is_dup = 0
          AND content IS NOT NULL AND length(trim(content)) > 0
        ORDER BY id ASC LIMIT ?`
    )
    .bind(after, limit)
    .all<Record<string, unknown>>();
  return results.map((r) => ({
    id: num(r, 'id'),
    txid: str(r, 'txid'),
    address: str(r, 'address'),
    content: str(r, 'content'),
    category: nullableStr(r, 'category'),
    content_hash: nullableStr(r, 'content_hash'),
    ts: num(r, 'ts'),
  }));
}

export async function countUnclassified(db: D1Database): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM messages
        WHERE category IS NULL AND (protocol = 'text' OR protocol IS NULL) AND is_dup = 0
          AND content IS NOT NULL AND length(trim(content)) > 0`
    )
    .first<{ n: number }>();
  return Number(row?.n ?? 0);
}

// ---------------------------------------------------------------------------
// Votes
// ---------------------------------------------------------------------------

export async function getVote(db: D1Database, messageId: number, voterHash: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 AS found FROM votes WHERE message_id = ? AND voter_hash = ?')
    .bind(messageId, voterHash)
    .first<Record<string, unknown>>();
  return Boolean(row);
}

export async function addVote(
  db: D1Database,
  messageId: number,
  voterHash: string,
  direction: 'up' | 'down' = 'up'
): Promise<void> {
  const delta = direction === 'down' ? -1 : 1;
  await db.batch([
    db.prepare('INSERT INTO votes (message_id, voter_hash) VALUES (?, ?)').bind(messageId, voterHash),
    db.prepare('UPDATE messages SET likes = MAX(0, likes + ?) WHERE id = ?').bind(delta, messageId),
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

// ---------------------------------------------------------------------------
// Admin: collections & addresses
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Full-chain ingestion: blocks + cursors (see migration 0008)
// ---------------------------------------------------------------------------

export interface BlockRow {
  height: number;
  hash: string;
  time: number;
  tx_count: number;
  opreturn_count: number;
  runes_count: number;
  binary_count: number;
  stored_count: number;
  scanned_at?: string;
}

function mapBlock(r: Record<string, unknown>): BlockRow {
  return {
    height: num(r, 'height'),
    hash: str(r, 'hash'),
    time: num(r, 'time'),
    tx_count: num(r, 'tx_count'),
    opreturn_count: num(r, 'opreturn_count'),
    runes_count: num(r, 'runes_count'),
    binary_count: num(r, 'binary_count'),
    stored_count: num(r, 'stored_count'),
    scanned_at: str(r, 'scanned_at'),
  };
}

export async function getIngestState(db: D1Database): Promise<Record<string, string>> {
  const { results } = await db.prepare('SELECT key, value FROM ingest_state').all<{ key: string; value: string }>();
  const out: Record<string, string> = {};
  for (const r of results) out[r.key] = r.value;
  return out;
}

export function setIngestStateStatement(db: D1Database, key: string, value: string | number): D1PreparedStatement {
  return db
    .prepare('INSERT INTO ingest_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .bind(key, String(value));
}

export async function setIngestState(db: D1Database, values: Record<string, string | number>): Promise<void> {
  const stmts = Object.entries(values).map(([k, v]) => setIngestStateStatement(db, k, v));
  if (stmts.length) await db.batch(stmts);
}

export async function getBlock(db: D1Database, height: number): Promise<BlockRow | null> {
  const row = await db.prepare('SELECT * FROM blocks WHERE height = ?').bind(height).first<Record<string, unknown>>();
  return row ? mapBlock(row) : null;
}

export async function getBlockByHash(db: D1Database, hash: string): Promise<BlockRow | null> {
  const row = await db.prepare('SELECT * FROM blocks WHERE hash = ?').bind(hash).first<Record<string, unknown>>();
  return row ? mapBlock(row) : null;
}

/** Highest scanned block below `belowHeight` (the forward cursor's predecessor). */
export async function getHighestBlockBelow(db: D1Database, belowHeight: number): Promise<BlockRow | null> {
  const row = await db
    .prepare('SELECT * FROM blocks WHERE height < ? ORDER BY height DESC LIMIT 1')
    .bind(belowHeight)
    .first<Record<string, unknown>>();
  return row ? mapBlock(row) : null;
}

export async function listRecentBlocks(db: D1Database, limit = 50): Promise<BlockRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM blocks ORDER BY height DESC LIMIT ?')
    .bind(limit)
    .all<Record<string, unknown>>();
  return results.map(mapBlock);
}

export interface ChainStats {
  blocks: number;
  lowest_height: number | null;
  highest_height: number | null;
  opreturn_outputs: number;
  runes_outputs: number;
  binary_outputs: number;
  stored_txs: number;
}

export async function getChainStats(db: D1Database): Promise<ChainStats> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS blocks, MIN(height) AS lo, MAX(height) AS hi,
              COALESCE(SUM(opreturn_count), 0) AS ors, COALESCE(SUM(runes_count), 0) AS runes,
              COALESCE(SUM(binary_count), 0) AS bin, COALESCE(SUM(stored_count), 0) AS stored
         FROM blocks`
    )
    .first<Record<string, unknown>>();
  return {
    blocks: row ? num(row, 'blocks') : 0,
    lowest_height: row ? nullableNum(row, 'lo') : null,
    highest_height: row ? nullableNum(row, 'hi') : null,
    opreturn_outputs: row ? num(row, 'ors') : 0,
    runes_outputs: row ? num(row, 'runes') : 0,
    binary_outputs: row ? num(row, 'bin') : 0,
    stored_txs: row ? num(row, 'stored') : 0,
  };
}

export function upsertBlockStatement(db: D1Database, b: BlockRow): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO blocks (height, hash, time, tx_count, opreturn_count, runes_count, binary_count, stored_count, scanned_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(height) DO UPDATE SET hash = excluded.hash, time = excluded.time, tx_count = excluded.tx_count,
         opreturn_count = excluded.opreturn_count, runes_count = excluded.runes_count,
         binary_count = excluded.binary_count, stored_count = excluded.stored_count, scanned_at = excluded.scanned_at`
    )
    .bind(b.height, b.hash, b.time, b.tx_count, b.opreturn_count, b.runes_count, b.binary_count, b.stored_count);
}

/** Confirm rows the poller had already stored as mempool when their block gets scanned. */
export function confirmTxidsStatements(
  db: D1Database,
  txids: string[],
  blockTime: number,
  blockHeight: number
): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = [];
  for (let i = 0; i < txids.length; i += 45) {
    const chunk = txids.slice(i, i + 45);
    const marks = chunk.map(() => '?').join(',');
    stmts.push(
      db
        .prepare(
          `UPDATE messages
              SET is_mempool = 0,
                  block_time = COALESCE(block_time, ?),
                  block_height = COALESCE(block_height, ?),
                  ts = COALESCE(block_time, ?)
            WHERE txid IN (${marks}) AND (is_mempool = 1 OR block_height IS NULL OR block_time IS NULL)`
        )
        .bind(blockTime, blockHeight, blockTime, ...chunk),
      db.prepare(`UPDATE ops SET ts = ? WHERE txid IN (${marks}) AND ts != ?`).bind(blockTime, ...chunk, blockTime)
    );
  }
  return stmts;
}

/** Among the given content hashes, the (address, hash) groups that hold more than one row. */
export async function findMultiGroups(db: D1Database, hashes: string[]): Promise<GroupKey[]> {
  const out: GroupKey[] = [];
  const uniq = [...new Set(hashes)];
  for (let i = 0; i < uniq.length; i += 90) {
    const chunk = uniq.slice(i, i + 90);
    const { results } = await db
      .prepare(
        `SELECT address, content_hash FROM messages
          WHERE content_hash IN (${chunk.map(() => '?').join(',')})
          GROUP BY address, content_hash HAVING COUNT(*) > 1`
      )
      .bind(...chunk)
      .all<{ address: string; content_hash: string }>();
    out.push(...results);
  }
  return out;
}

/**
 * Undo everything from `forkHeight` upwards after a reorg. Rows that only
 * exist because block ingestion saw them are deleted; rows the address
 * poller owns go back to "unconfirmed" so the poller re-confirms or evicts
 * them. Returns the dedupe groups that need recomputing.
 */
export async function rollbackFrom(db: D1Database, forkHeight: number): Promise<GroupKey[]> {
  const { results } = await db
    .prepare('SELECT txid, address, content_hash, monitored_address FROM messages WHERE block_height >= ?')
    .bind(forkHeight)
    .all<{ txid: string; address: string; content_hash: string | null; monitored_address: string | null }>();
  const groups: GroupKey[] = [];
  for (const r of results) if (r.content_hash) groups.push({ address: r.address, content_hash: r.content_hash });

  const orphaned = results.filter((r) => r.monitored_address == null).map((r) => r.txid);
  await deleteByTxids(db, orphaned);
  await db.batch([
    db
      .prepare(
        `UPDATE messages
            SET block_height = NULL, block_time = NULL, is_mempool = 1,
                ts = CAST(strftime('%s', created_at) AS INTEGER)
          WHERE block_height >= ?`
      )
      .bind(forkHeight),
    db
      .prepare('UPDATE ops SET ts = (SELECT ts FROM messages m WHERE m.txid = ops.txid) WHERE txid IN (SELECT txid FROM messages WHERE block_height IS NULL AND is_mempool = 1)')
      .bind(),
    db.prepare('DELETE FROM blocks WHERE height >= ?').bind(forkHeight),
  ]);
  return groups;
}
