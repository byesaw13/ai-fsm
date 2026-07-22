-- Migration 158: plan work_order_tasks on a field day (visit).
-- Completion stays on work_order_tasks; visit_tasks is the day plan.

CREATE TABLE IF NOT EXISTS visit_tasks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  visit_id    UUID        NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  task_id     UUID        NOT NULL REFERENCES work_order_tasks(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (visit_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_visit_tasks_visit ON visit_tasks (visit_id);
CREATE INDEX IF NOT EXISTS idx_visit_tasks_task ON visit_tasks (task_id);
CREATE INDEX IF NOT EXISTS idx_visit_tasks_account ON visit_tasks (account_id);

ALTER TABLE visit_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_tasks FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'visit_tasks' AND policyname = 'visit_tasks_select') THEN
    CREATE POLICY visit_tasks_select ON visit_tasks FOR SELECT
      USING (account_id = app_account_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'visit_tasks' AND policyname = 'visit_tasks_insert') THEN
    CREATE POLICY visit_tasks_insert ON visit_tasks FOR INSERT
      WITH CHECK (account_id = app_account_id() AND app_role() IN ('owner', 'admin', 'tech'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'visit_tasks' AND policyname = 'visit_tasks_update') THEN
    CREATE POLICY visit_tasks_update ON visit_tasks FOR UPDATE
      USING (account_id = app_account_id() AND app_role() IN ('owner', 'admin', 'tech'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'visit_tasks' AND policyname = 'visit_tasks_delete') THEN
    CREATE POLICY visit_tasks_delete ON visit_tasks FOR DELETE
      USING (account_id = app_account_id() AND app_role() IN ('owner', 'admin', 'tech'));
  END IF;
END $$;

COMMENT ON TABLE visit_tasks IS
  'Plans which work_order_tasks are targeted on a field day (visit). Task completion remains on work_order_tasks.';

-- DOWN
-- DROP TABLE IF EXISTS visit_tasks;
