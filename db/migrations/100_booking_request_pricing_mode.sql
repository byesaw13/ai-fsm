-- Persist the request review pricing decision.
-- flat_rate = fixed bid workflow
-- hourly_internal = time and materials workflow

ALTER TABLE booking_requests
  ADD COLUMN IF NOT EXISTS pricing_mode TEXT NOT NULL DEFAULT 'flat_rate'
    CHECK (pricing_mode IN ('flat_rate', 'hourly_internal'));

COMMENT ON COLUMN booking_requests.pricing_mode IS 'Request review pricing mode: fixed bid or time and materials.';
