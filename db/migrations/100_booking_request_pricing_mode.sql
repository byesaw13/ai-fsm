-- Persist the request review pricing decision.
-- flat_rate = fixed bid workflow
-- hourly_internal = time and materials workflow
-- NULL = operator has not yet chosen a path (pending review)
--
-- Default is intentionally NULL so that existing and newly-created requests
-- remain in the "Choose Path" state until an operator explicitly selects one.
-- A DEFAULT 'flat_rate' would silently pre-fill the decision and let T&M work
-- flow into the fixed-bid estimate/walkthrough path without an operator choice.

ALTER TABLE booking_requests
  ADD COLUMN IF NOT EXISTS pricing_mode TEXT DEFAULT NULL
    CHECK (pricing_mode IS NULL OR pricing_mode IN ('flat_rate', 'hourly_internal'));

COMMENT ON COLUMN booking_requests.pricing_mode IS 'Request review pricing mode: flat_rate, hourly_internal, or NULL (not yet decided).';
