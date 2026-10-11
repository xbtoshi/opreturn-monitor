-- Shared cache for site-wide aggregates (see memoAggregate in src/db.ts): one
-- row per key, so an expensive stat is computed once per TTL across all
-- isolates and colos instead of once per cold isolate.
CREATE TABLE IF NOT EXISTS agg_cache (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  at    INTEGER NOT NULL
);
