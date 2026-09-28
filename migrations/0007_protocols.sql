-- 0007_protocols.sql
-- Turn the address monitor into an OP_RETURN explorer.
--
-- messages gains:
--   protocol          primary protocol slug (text | ico-20 | thorchain | ...); NULL until
--                     the cron's reparse job has looked at a legacy row
--   recipient         address of the tx's first non-OP_RETURN output
--   monitored_address the monitored address this row is attributed to (NULL for rows that
--                     only exist because block ingestion saw them). Collections filter on
--                     this column; `address` keeps its historical meaning and is never rewritten.
--   block_height      height of the block that mined the tx (NULL if unconfirmed / unknown)
--   ts                stored sort key: block_time, else the moment we first saw the tx
--   is_dup/dup_count  precomputed "same content to the same address" collapse, so the feed
--                     is a plain keyset query instead of a window function over the table
--   content_hash      key of that collapse group (sha256 prefix of content or payload)
--   detail_tries      how often the per-txid detail backfill has tried this row
--
-- ops holds one row per OP_RETURN output so a tx carrying both an ico-20 transfer and a
-- crc-20 mint is reachable from either protocol page.

ALTER TABLE messages ADD COLUMN protocol TEXT;
ALTER TABLE messages ADD COLUMN recipient TEXT;
ALTER TABLE messages ADD COLUMN monitored_address TEXT;
ALTER TABLE messages ADD COLUMN block_height INTEGER;
ALTER TABLE messages ADD COLUMN ts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE messages ADD COLUMN is_dup INTEGER NOT NULL DEFAULT 0;
ALTER TABLE messages ADD COLUMN dup_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE messages ADD COLUMN content_hash TEXT;
ALTER TABLE messages ADD COLUMN detail_tries INTEGER NOT NULL DEFAULT 0;

-- Every legacy row came from the address poller, so it is attributed to `address`.
UPDATE messages
   SET monitored_address = address,
       ts = COALESCE(block_time, CAST(strftime('%s', created_at) AS INTEGER));

CREATE TABLE IF NOT EXISTS ops (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  txid        TEXT NOT NULL,
  vout        INTEGER NOT NULL,
  protocol    TEXT NOT NULL,
  op          TEXT,
  tick        TEXT,
  amount      TEXT,
  payload_hex TEXT,
  ts          INTEGER NOT NULL DEFAULT 0,
  UNIQUE (txid, vout)
);

CREATE INDEX IF NOT EXISTS idx_ops_protocol_ts ON ops(protocol, ts DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_ops_tick_ts     ON ops(tick, ts DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_ops_txid        ON ops(txid);

CREATE INDEX IF NOT EXISTS idx_messages_proto_feed ON messages(protocol, is_dup, ts DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_messages_hot        ON messages(is_dup, likes DESC, ts DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_messages_new        ON messages(is_dup, ts DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_messages_monitored  ON messages(monitored_address, is_dup, ts DESC, id DESC);
-- Address pages union three indexed, time-ordered branches (filed-under,
-- recipient, sender); each index carries the feed sort key so no branch sorts.
CREATE INDEX IF NOT EXISTS idx_messages_addr_feed  ON messages(address, is_dup, ts DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_messages_recipient  ON messages(recipient, is_dup, ts DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender     ON messages(sender, is_dup, ts DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_messages_group      ON messages(address, content_hash);
CREATE INDEX IF NOT EXISTS idx_messages_height     ON messages(block_height);
CREATE INDEX IF NOT EXISTS idx_messages_reparse    ON messages(id) WHERE protocol IS NULL;
CREATE INDEX IF NOT EXISTS idx_messages_detail     ON messages(id)
  WHERE detail_tries < 3 AND (sender IS NULL OR recipient IS NULL OR fee_sats IS NULL);
