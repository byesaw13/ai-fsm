-- Migration 204: prepared scope on estimates (TASK-179).
-- Prepare Quote turns a saved assessment into a draft estimate. The draft
-- remembers which visit it came from and keeps the structured scope (tasks by
-- room, quantities with their source, hour ranges, questions) so it reloads
-- intact. One open draft per visit: pressing Prepare Quote again resumes it.
-- Line items made by Apply to quote record the group that produced them, so
-- regenerating never touches lines the owner added by hand.
-- Additive only; existing estimates keep NULLs and behave as before.

ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS source_visit_id UUID REFERENCES visits(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prepared_scope  JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS uq_estimates_open_draft_per_source_visit
  ON estimates (account_id, source_visit_id)
  WHERE status = 'draft' AND source_visit_id IS NOT NULL;

ALTER TABLE estimate_line_items
  ADD COLUMN IF NOT EXISTS prepared_group_key TEXT;

-- Reversal:
-- ALTER TABLE estimate_line_items DROP COLUMN IF EXISTS prepared_group_key;
-- DROP INDEX IF EXISTS uq_estimates_open_draft_per_source_visit;
-- ALTER TABLE estimates DROP COLUMN IF EXISTS prepared_scope;
-- ALTER TABLE estimates DROP COLUMN IF EXISTS source_visit_id;
