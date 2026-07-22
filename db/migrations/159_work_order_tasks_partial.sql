-- Migration 159: partial task status (started, not finished) + optional parent for remainder tasks.

ALTER TABLE work_order_tasks DROP CONSTRAINT IF EXISTS work_order_tasks_status_check;
ALTER TABLE work_order_tasks
  ADD CONSTRAINT work_order_tasks_status_check
  CHECK (status IN ('open', 'done', 'blocked', 'partial'));

ALTER TABLE work_order_tasks
  ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES work_order_tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_work_order_tasks_parent
  ON work_order_tasks (parent_task_id) WHERE parent_task_id IS NOT NULL;

COMMENT ON COLUMN work_order_tasks.status IS
  'open = not started; partial = started not finished; done = complete; blocked = waiting';
COMMENT ON COLUMN work_order_tasks.parent_task_id IS
  'When set, this task is the remainder of a partial parent (what is left to do).';

-- DOWN
-- ALTER TABLE work_order_tasks DROP COLUMN IF EXISTS parent_task_id;
-- ALTER TABLE work_order_tasks DROP CONSTRAINT IF EXISTS work_order_tasks_status_check;
-- ALTER TABLE work_order_tasks ADD CONSTRAINT work_order_tasks_status_check CHECK (status IN ('open', 'done', 'blocked'));
