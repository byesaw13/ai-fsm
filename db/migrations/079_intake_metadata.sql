-- Stores service-specific follow-up question answers captured at intake time.
-- Structure: { [questionKey: string]: string }
-- e.g. { "surface": "interior", "room_count": "2-3", "issue_type": "dripping_faucet" }

ALTER TABLE booking_requests
  ADD COLUMN IF NOT EXISTS intake_metadata JSONB;
