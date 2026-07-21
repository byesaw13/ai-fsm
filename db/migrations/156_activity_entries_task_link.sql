-- Migration 156: link captured time to a work-order task (EPIC-008 Slice 1).
--
-- Time-on-a-task = SUM of the activity_entries carrying that task_id, so
-- per-task actuals accumulate for costing baselines. Adds 'work_order' to the
-- entity_type set (an activity may point at a work order, with task_id naming
-- the specific task).

ALTER TABLE activity_entries
  ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES work_order_tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_activity_entries_task
  ON activity_entries (task_id) WHERE task_id IS NOT NULL;

-- Expand entity_type to allow 'work_order'.
ALTER TABLE activity_entries DROP CONSTRAINT IF EXISTS activity_entries_entity_type_check;
ALTER TABLE activity_entries
  ADD CONSTRAINT activity_entries_entity_type_check
  CHECK (entity_type IN ('job','visit','estimate','invoice','client','expense','work_order'));

COMMENT ON COLUMN activity_entries.task_id IS
  'Work-order task this time is attributed to (EPIC-008 baselines). Null for untasked time.';

-- Reversal:
-- ALTER TABLE activity_entries DROP CONSTRAINT IF EXISTS activity_entries_entity_type_check;
-- ALTER TABLE activity_entries ADD CONSTRAINT activity_entries_entity_type_check
--   CHECK (entity_type IN ('job','visit','estimate','invoice','client','expense'));
-- ALTER TABLE activity_entries DROP COLUMN IF EXISTS task_id;
