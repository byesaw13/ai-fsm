-- Migration 096: intake_invites improvements
-- 1. Extend default expiry from 48h to 7 days (homeowners don't always reply immediately)
-- 2. Add delivery_method for future SMS support (email-only today)

ALTER TABLE intake_invites
  ALTER COLUMN expires_at SET DEFAULT now() + interval '7 days';

ALTER TABLE intake_invites
  ADD COLUMN IF NOT EXISTS delivery_method text NOT NULL DEFAULT 'email'
    CHECK (delivery_method IN ('email', 'sms'));

COMMENT ON COLUMN intake_invites.delivery_method IS 'How the invite was sent. sms requires Twilio integration (future).';

-- Note: existing rows with 48h expiry are unaffected — only new rows get 7-day default.
