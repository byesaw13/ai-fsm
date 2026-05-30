-- Migration 094: intake_invites — token-gated client self-service intake links
-- When staff captures a quick lead, they can email the lead a link to fill out
-- their own intake form. The token expires after 48 hours and is single-use.

CREATE TABLE IF NOT EXISTS intake_invites (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  booking_request_id  uuid REFERENCES booking_requests(id) ON DELETE CASCADE,
  token               uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  lead_name           text NOT NULL,
  lead_email          text NOT NULL,
  lead_phone          text,
  expires_at          timestamptz NOT NULL DEFAULT now() + interval '48 hours',
  used_at             timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Fast lookup by token (only for unused invites)
CREATE INDEX IF NOT EXISTS idx_intake_invites_token
  ON intake_invites (token)
  WHERE used_at IS NULL;

COMMENT ON TABLE intake_invites IS 'Token-gated links sent to leads so they can fill out their intake form. Tokens expire after 48h and are single-use.';
