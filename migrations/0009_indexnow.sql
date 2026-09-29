-- IndexNow push bookkeeping: each human-message representative is announced
-- to the hub once; the partial index keeps the candidate scan tiny.
ALTER TABLE messages ADD COLUMN indexnow_pushed_at INTEGER;
CREATE INDEX IF NOT EXISTS idx_messages_indexnow ON messages(id) WHERE indexnow_pushed_at IS NULL AND protocol = 'text' AND is_dup = 0;
