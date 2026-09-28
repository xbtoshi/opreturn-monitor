-- 0008_blocks.sql
-- Full-chain block ingestion state.
--
-- blocks       one row per scanned block: canonical hash (for reorg detection) and the
--              OP_RETURN census of that block. Runes and opaque binary payloads are
--              counted here rather than stored as message rows.
-- ingest_state key/value cursors: next_height (forward), backfill_height (walks down),
--              backfill_floor (where the backfill stops).

CREATE TABLE IF NOT EXISTS blocks (
  height         INTEGER PRIMARY KEY,
  hash           TEXT NOT NULL UNIQUE,
  time           INTEGER NOT NULL,
  tx_count       INTEGER NOT NULL,
  opreturn_count INTEGER NOT NULL DEFAULT 0,
  runes_count    INTEGER NOT NULL DEFAULT 0,
  binary_count   INTEGER NOT NULL DEFAULT 0,
  stored_count   INTEGER NOT NULL DEFAULT 0,
  scanned_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_blocks_time ON blocks(time);

CREATE TABLE IF NOT EXISTS ingest_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
