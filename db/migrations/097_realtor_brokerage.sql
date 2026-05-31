-- Migration 097: Add brokerage_name to booking_requests
-- referral_name already stores the individual realtor's name.
-- brokerage_name stores their company (e.g. "Coldwell Banker", "Keller Williams").
-- Both together enable grouping referral metrics by brokerage.

ALTER TABLE booking_requests
  ADD COLUMN IF NOT EXISTS brokerage_name TEXT;

COMMENT ON COLUMN booking_requests.brokerage_name IS 'Realtor brokerage / company name. Set when referral_source = realtor.';
