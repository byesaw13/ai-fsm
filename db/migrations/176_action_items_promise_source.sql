-- Migration 176: link action_items to capture_evidence for owner promises.
-- Multiple promises may attach to one entity. Legacy open uniqueness stays
-- for rows that are not capture-backed.

ALTER TABLE action_items
  ADD COLUMN IF NOT EXISTS source_capture_id UUID REFERENCES capture_evidence(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS action_items_source_capture_unique
  ON action_items (source_capture_id)
  WHERE source_capture_id IS NOT NULL;

DROP INDEX IF EXISTS action_items_open_unique;

CREATE UNIQUE INDEX action_items_open_unique
  ON action_items (account_id, entity_id, action_type)
  WHERE resolved_at IS NULL AND source_capture_id IS NULL;

-- Reversal:
-- DROP INDEX IF EXISTS action_items_source_capture_unique;
-- DROP INDEX IF EXISTS action_items_open_unique;
-- CREATE UNIQUE INDEX action_items_open_unique
--   ON action_items (account_id, entity_id, action_type)
--   WHERE resolved_at IS NULL;
-- ALTER TABLE action_items DROP COLUMN IF EXISTS source_capture_id;
