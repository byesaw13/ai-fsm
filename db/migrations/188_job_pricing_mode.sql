-- Driveway / quick jobs store T&M on the job so billing cannot silently
-- become a fixed bid. Quoted work may leave this NULL and inherit from
-- the approved estimate.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS pricing_mode TEXT
    CHECK (pricing_mode IS NULL OR pricing_mode IN ('flat_rate', 'hourly_internal'));

COMMENT ON COLUMN jobs.pricing_mode IS
  'hourly_internal = driveway T&M (quick-book). flat_rate = quoted. NULL inherits from estimate/booking.';
