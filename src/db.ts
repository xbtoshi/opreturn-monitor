import type { Address, CollectionWithStats, Message } from './types';

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
      `SELECT c.id, c.name, c.description, c.created_at,
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
    created_at: str(r, 'created_at'),
    address_count: num(r, 'address_count'),
    message_count: num(r, 'message_count'),
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
  sort: 'hot' | 'new';
  limit: number;
  before?: number;
}

export async function getMessages(
  db: D1Database,
  opts: GetMessagesOpts
): Promise<{ messages: Message[]; next_before: number | null }> {
  const params: unknown[] = [];
  let where = '';

  if (opts.collectionId) {
    where = 'WHERE a.collection_id = ?';
    params.push(opts.collectionId);
  }
  if (opts.before) {
    where += where ? ' AND m.id < ?' : 'WHERE m.id < ?';
    params.push(opts.before);
  }

  const order = opts.sort === 'hot' ? 'm.likes DESC, m.id DESC' : 'm.id DESC';
  params.push(opts.limit);

  const { results } = await db
    .prepare(
      `SELECT m.id, m.txid, m.address, m.content, m.category, m.likes, m.is_mempool, m.created_at
         FROM messages m
         JOIN addresses a ON a.address = m.address
         ${where}
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
    raw_hex: null,
  }));

  const next_before = messages.length >= opts.limit ? messages[messages.length - 1].id : null;
  return { messages, next_before };
}

export async function getMessage(db: D1Database, id: number): Promise<Message | null> {
  const row = await db.prepare('SELECT * FROM messages WHERE id = ?').bind(id).first<Record<string, unknown>>();
  if (!row) return null;
  return {
    id: num(row, 'id'),
    txid: str(row, 'txid'),
    address: str(row, 'address'),
    content: nullableStr(row, 'content'),
    category: nullableStr(row, 'category'),
    likes: num(row, 'likes'),
    is_mempool: num(row, 'is_mempool'),
    created_at: str(row, 'created_at'),
    raw_hex: nullableStr(row, 'raw_hex'),
  };
}

export interface NewMessage {
  txid: string;
  address: string;
  content: string;
  raw_hex: string | null;
  is_mempool: boolean;
}

/**
 * Insert a message. Returns true if it was newly inserted (txid was unique),
 * false if it already existed.
 */
export async function insertMessage(db: D1Database, msg: NewMessage): Promise<boolean> {
  const res = await db
    .prepare(
      'INSERT OR IGNORE INTO messages (txid, address, content, is_mempool, raw_hex) VALUES (?, ?, ?, ?, ?)'
    )
    .bind(msg.txid, msg.address, msg.content, msg.is_mempool ? 1 : 0, msg.raw_hex)
    .run();
  return res.meta.changes > 0;
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
    raw_hex: null,
  }));
}

export async function setCategory(db: D1Database, messageId: number, category: string): Promise<void> {
  await db.prepare('UPDATE messages SET category = ? WHERE id = ?').bind(category, messageId).run();
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

export async function createCollection(
  db: D1Database,
  name: string,
  description: string | null
): Promise<number> {
  const res = await db
    .prepare('INSERT INTO collections (name, description) VALUES (?, ?)')
    .bind(name, description ?? null)
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
