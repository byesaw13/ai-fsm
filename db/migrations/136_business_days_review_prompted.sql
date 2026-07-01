-- Migration 136: day-review state columns.
--
-- business_days.review_prompted_at — when HA fired the home-arrival trigger.
-- activity_entries.revised_after_close — stamps entries created after the
--   business day was already CLOSED (audit trail for post-close edits).

ALTER TABLE business_days
  ADD COLUMN IF NOT EXISTS review_prompted_at TIMESTAMPTZ;

ALTER TABLE activity_entries
  ADD COLUMN IF NOT EXISTS revised_after_close BOOLEAN NOT NULL DEFAULT FALSE;

-- Rollback:
-- ALTER TABLE business_days DROP COLUMN IF EXISTS review_prompted_at;
-- ALTER TABLE activity_entries DROP COLUMN IF EXISTS revised_after_close;
