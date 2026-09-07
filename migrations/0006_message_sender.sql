-- 0006_message_sender.sql
-- Record who sent each message: the address behind the transaction's first
-- input (vin[0].prevout). `address` is the MONITORED address the tx touched,
-- which may be the recipient or the sender; `sender` lets the chat view
-- attribute bubbles to the party that actually wrote them. NULL until the
-- cron backfills rows that predate this column.

ALTER TABLE messages ADD COLUMN sender TEXT;
