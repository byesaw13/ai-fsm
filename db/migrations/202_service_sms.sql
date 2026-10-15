-- Service texts over the Android SMS gateway.
-- Channel was email-only. SMS rows carry the plain text in html_body.
ALTER TABLE notification_queue DROP CONSTRAINT IF EXISTS notification_queue_channel_check;
ALTER TABLE notification_queue
  ADD CONSTRAINT notification_queue_channel_check CHECK (channel IN ('email', 'sms'));

ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS customer_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS on_the_way_sent_at timestamptz;

ALTER TABLE communications_log
  ADD COLUMN IF NOT EXISTS suggested_reply text;

-- Rollback:
-- ALTER TABLE communications_log DROP COLUMN IF EXISTS suggested_reply;
-- ALTER TABLE visits DROP COLUMN IF EXISTS on_the_way_sent_at, DROP COLUMN IF EXISTS customer_confirmed_at;
-- ALTER TABLE notification_queue DROP CONSTRAINT IF EXISTS notification_queue_channel_check;
-- ALTER TABLE notification_queue ADD CONSTRAINT notification_queue_channel_check CHECK (channel IN ('email'));
