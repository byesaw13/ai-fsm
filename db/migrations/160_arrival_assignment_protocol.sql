-- Migration 160: Arrival → Assignment Protocol
-- Extends visit_candidates with work order targeting + live prompt metadata.
-- Allows open-stop proposals (nullable departure/duration).

ALTER TABLE visit_candidates
  ADD COLUMN IF NOT EXISTS work_order_id UUID REFERENCES work_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS wo_resolution TEXT NOT NULL DEFAULT 'unknown'
    CHECK (wo_resolution IN ('unknown', 'clear', 'ambiguous', 'none', 'resolved')),
  ADD COLUMN IF NOT EXISTS live_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS live_prompted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

ALTER TABLE visit_candidates
  ALTER COLUMN departure_time DROP NOT NULL,
  ALTER COLUMN duration_minutes DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_visit_candidates_work_order
  ON visit_candidates (account_id, work_order_id)
  WHERE work_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_visit_candidates_live_pending
  ON visit_candidates (account_id, status)
  WHERE status = 'pending' AND live_eligible = TRUE;

-- Reversal:
-- DROP INDEX IF EXISTS idx_visit_candidates_live_pending;
-- DROP INDEX IF EXISTS idx_visit_candidates_work_order;
-- ALTER TABLE visit_candidates
--   DROP COLUMN IF EXISTS confirmed_at,
--   DROP COLUMN IF EXISTS live_prompted_at,
--   DROP COLUMN IF EXISTS live_eligible,
--   DROP COLUMN IF EXISTS wo_resolution,
--   DROP COLUMN IF EXISTS work_order_id;
