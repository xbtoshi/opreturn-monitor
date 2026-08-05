-- 0005_address_suggestions.sql
-- Public "suggest an address" queue. Submissions land here as `pending`; an
-- admin approves (promotes the row into `addresses`, which the cron then scans)
-- or rejects. Never write user input straight into `addresses`.

CREATE TABLE IF NOT EXISTS address_suggestions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  address       TEXT NOT NULL,
  collection_id INTEGER REFERENCES collections(id) ON DELETE SET NULL,
  note          TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  voter_hash    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_suggestions_status ON address_suggestions(status);
