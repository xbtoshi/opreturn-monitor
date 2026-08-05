-- 0003_message_fee.sql
-- Record the transaction fee so an "urgent" signal is visible: someone who
-- overpays the network to etch a message fast is broadcasting urgency.

ALTER TABLE messages ADD COLUMN fee_sats INTEGER;
ALTER TABLE messages ADD COLUMN fee_rate REAL;
