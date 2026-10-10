-- Classifier candidate scan (getUnclassifiedMessages / countUnclassified):
-- without this, every run walks the whole table to find the few (usually
-- zero) unclassified human-text representatives. The WHERE mirrors the
-- query's terms verbatim so SQLite can prove the partial index applies.
CREATE INDEX IF NOT EXISTS idx_messages_unclassified ON messages(id)
  WHERE category IS NULL AND (protocol = 'text' OR protocol IS NULL) AND is_dup = 0;
