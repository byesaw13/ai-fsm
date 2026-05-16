-- Migration 064: Vendor coordination modes and concierge management fee on jobs
--
-- Allows jobs to be flagged as vendor-coordinated work:
--   referral  — Dovetails refers the client to a specialist; no ongoing coordination
--   concierge — Dovetails coordinates the vendor on the client's behalf; a management
--               fee applies (stored in concierge_fee_cents)
--
-- DOWN: ALTER TABLE jobs DROP COLUMN IF EXISTS vendor_coordination, DROP COLUMN IF EXISTS concierge_fee_cents;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS vendor_coordination TEXT
    CHECK (vendor_coordination IN ('referral', 'concierge')),
  ADD COLUMN IF NOT EXISTS concierge_fee_cents INTEGER
    CHECK (concierge_fee_cents IS NULL OR concierge_fee_cents >= 0);

CREATE INDEX IF NOT EXISTS idx_jobs_vendor_coordination
  ON jobs (account_id, vendor_coordination)
  WHERE vendor_coordination IS NOT NULL;
