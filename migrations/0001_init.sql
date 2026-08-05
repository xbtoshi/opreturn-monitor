-- 0001_init.sql
-- Bitcoin OP_RETURN Message Monitor — initial schema

CREATE TABLE IF NOT EXISTS collections (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS addresses (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  address       TEXT NOT NULL UNIQUE,
  label         TEXT,
  collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  txid       TEXT NOT NULL UNIQUE,
  address    TEXT NOT NULL,
  content    TEXT,
  category   TEXT,
  likes      INTEGER NOT NULL DEFAULT 0,
  is_mempool INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  raw_hex    TEXT
);

CREATE TABLE IF NOT EXISTS votes (
  message_id INTEGER NOT NULL,
  voter_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (message_id, voter_hash)
);

CREATE INDEX IF NOT EXISTS idx_addresses_collection ON addresses(collection_id);
CREATE INDEX IF NOT EXISTS idx_messages_address      ON messages(address);
CREATE INDEX IF NOT EXISTS idx_messages_created_at   ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_likes        ON messages(likes);
CREATE INDEX IF NOT EXISTS idx_messages_category     ON messages(category);
