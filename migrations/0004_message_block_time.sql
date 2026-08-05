-- 0004_message_block_time.sql
-- Record the on-chain time (unix seconds) of the transaction from the mempool
-- API, so displayed timestamps reflect when the message was actually etched
-- into a block, not when the monitor first saw it. NULL for unconfirmed txs.

ALTER TABLE messages ADD COLUMN block_time INTEGER;
CREATE INDEX IF NOT EXISTS idx_messages_block_time ON messages(block_time);
