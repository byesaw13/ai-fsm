-- Migration 137: account-level day-review settings.
--
-- All additive with safe defaults so existing rows are unaffected.
-- Note: location_retention_days already exists (migration 124). Not re-added.

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS day_review_cutoff_time        TIME    NOT NULL DEFAULT '17:00',
  ADD COLUMN IF NOT EXISTS min_stop_dwell_minutes        INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS visit_confidence_threshold    INTEGER NOT NULL DEFAULT 70,
  ADD COLUMN IF NOT EXISTS suppress_weekend_start_prompt BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS close_day_followup_hours      INTEGER,
  ADD COLUMN IF NOT EXISTS tracking_start_time           TIME,
  ADD COLUMN IF NOT EXISTS tracking_end_time             TIME;

-- Rollback:
-- ALTER TABLE accounts
--   DROP COLUMN IF EXISTS day_review_cutoff_time,
--   DROP COLUMN IF EXISTS min_stop_dwell_minutes,
--   DROP COLUMN IF EXISTS visit_confidence_threshold,
--   DROP COLUMN IF EXISTS suppress_weekend_start_prompt,
--   DROP COLUMN IF EXISTS close_day_followup_hours,
--   DROP COLUMN IF EXISTS tracking_start_time,
--   DROP COLUMN IF EXISTS tracking_end_time;
