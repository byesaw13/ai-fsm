-- Migration 223: Dovetails Phone (TASK-260).
-- Our own Android app on the business SIM replaces the SMS Gateway app.
--   phone_outbox   texts the server wants sent; the phone pulls and reports.
--   phone_devices  the phone's last check-in (offline alert, Settings).
--   communications_log gains call outcomes (answered, missed) and a duration.
-- Calls are stored only for numbers that match a customer (server-side rule).
-- Written by the context-less /api/internal/phone/* routes, like the existing
-- /api/internal/sms route: account-scoped policies, account_id always explicit.

CREATE TABLE IF NOT EXISTS phone_outbox (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  to_phone      TEXT        NOT NULL,
  body          TEXT        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1600),
  status        TEXT        NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued', 'claimed', 'sent', 'delivered', 'failed')),
  attempts      INT         NOT NULL DEFAULT 0,
  claimed_by    TEXT,
  claimed_at    TIMESTAMPTZ,
  sent_at       TIMESTAMPTZ,
  delivered_at  TIMESTAMPTZ,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_phone_outbox_pending
  ON phone_outbox (account_id, created_at)
  WHERE status IN ('queued', 'claimed');

CREATE TABLE IF NOT EXISTS phone_devices (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  device_id     TEXT        NOT NULL,
  label         TEXT,
  app_version   TEXT,
  status        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, device_id)
);

ALTER TABLE phone_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_outbox FORCE ROW LEVEL SECURITY;
ALTER TABLE phone_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_devices FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'phone_outbox' AND policyname = 'phone_outbox_account') THEN
    CREATE POLICY phone_outbox_account ON phone_outbox
      USING (account_id = app_account_id())
      WITH CHECK (account_id = app_account_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'phone_devices' AND policyname = 'phone_devices_account') THEN
    CREATE POLICY phone_devices_account ON phone_devices
      USING (account_id = app_account_id())
      WITH CHECK (account_id = app_account_id());
  END IF;
END $$;

ALTER TABLE communications_log
  ADD COLUMN IF NOT EXISTS duration_seconds INT CHECK (duration_seconds IS NULL OR duration_seconds >= 0);

ALTER TABLE communications_log
  DROP CONSTRAINT IF EXISTS communications_log_outcome_check;
ALTER TABLE communications_log
  ADD CONSTRAINT communications_log_outcome_check
  CHECK (outcome = ANY (ARRAY[
    'sent'::text, 'delivered'::text, 'failed'::text,
    'no_answer'::text, 'left_voicemail'::text, 'replied'::text, 'received'::text,
    'answered'::text, 'missed'::text
  ]));

COMMENT ON COLUMN communications_log.outcome IS
  'sent/delivered/failed for outbound texts; received for inbound texts; replied for conversation turns; calls: answered, missed, left_voicemail (inbound), no_answer (outbound)';

-- Call-back lookups: phone rows per customer, newest first.
CREATE INDEX IF NOT EXISTS comms_log_client_channel
  ON communications_log (account_id, client_id, channel, created_at DESC);

-- Reversal:
-- DROP INDEX IF EXISTS comms_log_client_channel;
-- DELETE FROM communications_log WHERE outcome IN ('answered', 'missed');
-- ALTER TABLE communications_log DROP CONSTRAINT IF EXISTS communications_log_outcome_check;
-- ALTER TABLE communications_log ADD CONSTRAINT communications_log_outcome_check
--   CHECK (outcome = ANY (ARRAY['sent','delivered','failed','no_answer','left_voicemail','replied','received']));
-- ALTER TABLE communications_log DROP COLUMN IF EXISTS duration_seconds;
-- DROP TABLE IF EXISTS phone_devices;
-- DROP TABLE IF EXISTS phone_outbox;
