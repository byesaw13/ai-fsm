ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS sms_consent          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_consent_at       timestamptz,
  ADD COLUMN IF NOT EXISTS sms_consent_source   text,
  ADD COLUMN IF NOT EXISTS sms_consent_text     text,
  ADD COLUMN IF NOT EXISTS preferred_contact    text NOT NULL DEFAULT 'email'
                           CHECK (preferred_contact IN ('sms','email','phone')),
  ADD COLUMN IF NOT EXISTS contact_notes        text;

ALTER TABLE booking_requests
  ADD COLUMN IF NOT EXISTS sms_consent          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_consent_at       timestamptz,
  ADD COLUMN IF NOT EXISTS sms_consent_source   text,
  ADD COLUMN IF NOT EXISTS preferred_contact    text NOT NULL DEFAULT 'email'
                           CHECK (preferred_contact IN ('sms','email','phone'));
