-- Migration 155: first-class work-order tasks (TASK — EPIC-008 Slice 1).
--
-- The work-order checklist (work_orders.completion_criteria JSONB) becomes
-- first-class rows so that (a) captured time can attach to a task and (b) the
-- "I did this" checkoff has a stable identity to baseline against. The JSONB
-- column is left in place (inert) and backfilled here; tasks are the source of
-- truth going forward.

CREATE TABLE IF NOT EXISTS work_order_tasks (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     UUID         NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  work_order_id  UUID         NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  label          TEXT         NOT NULL,
  required       BOOLEAN      NOT NULL DEFAULT true,
  completed      BOOLEAN      NOT NULL DEFAULT false,
  completed_at   TIMESTAMPTZ,
  status         TEXT         NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open', 'done', 'blocked')),
  note           TEXT,
  sort_order     INTEGER      NOT NULL DEFAULT 0,
  source         TEXT         NOT NULL DEFAULT 'manual'
                   CHECK (source IN ('estimate', 'manual', 'ai')),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_work_order_tasks_wo ON work_order_tasks (work_order_id);
CREATE INDEX IF NOT EXISTS idx_work_order_tasks_account_open
  ON work_order_tasks (account_id) WHERE completed = false;

CREATE TRIGGER trg_work_order_tasks_updated_at BEFORE UPDATE ON work_order_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE work_order_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_order_tasks FORCE  ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='work_order_tasks' AND policyname='work_order_tasks_select') THEN
    CREATE POLICY work_order_tasks_select ON work_order_tasks FOR SELECT USING (account_id = app_account_id());
  END IF;
  -- Owner/admin manage the task list; the assigned lead can toggle done via the
  -- work-order lead path (mirrors migration 139), enforced at the app layer.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='work_order_tasks' AND policyname='work_order_tasks_insert') THEN
    CREATE POLICY work_order_tasks_insert ON work_order_tasks FOR INSERT WITH CHECK (
      account_id = app_account_id() AND app_role() IN ('owner','admin','tech'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='work_order_tasks' AND policyname='work_order_tasks_update') THEN
    CREATE POLICY work_order_tasks_update ON work_order_tasks FOR UPDATE USING (
      account_id = app_account_id() AND app_role() IN ('owner','admin','tech'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='work_order_tasks' AND policyname='work_order_tasks_delete') THEN
    CREATE POLICY work_order_tasks_delete ON work_order_tasks FOR DELETE USING (
      account_id = app_account_id() AND is_owner_or_admin());
  END IF;
END $$;

-- Backfill: one task per existing completion_criteria element (canonical
-- {label,required,completed} and legacy {description,done} shapes).
INSERT INTO work_order_tasks
  (account_id, work_order_id, label, required, completed, completed_at, status, sort_order, source)
SELECT wo.account_id,
       wo.id,
       COALESCE(NULLIF(TRIM(c->>'label'), ''), c->>'description', 'Task'),
       COALESCE((c->>'required')::boolean, true),
       done.val,
       CASE WHEN done.val THEN now() END,
       CASE WHEN done.val THEN 'done' ELSE 'open' END,
       (ord.idx - 1)::int,
       'estimate'
FROM work_orders wo
CROSS JOIN LATERAL jsonb_array_elements(wo.completion_criteria) WITH ORDINALITY AS ord(c, idx)
CROSS JOIN LATERAL (
  SELECT COALESCE((ord.c->>'completed')::boolean, (ord.c->>'done')::boolean, false) AS val
) done
WHERE jsonb_typeof(wo.completion_criteria) = 'array'
  AND COALESCE(NULLIF(TRIM(ord.c->>'label'), ''), ord.c->>'description', '') <> ''
  AND NOT EXISTS (SELECT 1 FROM work_order_tasks t WHERE t.work_order_id = wo.id);

-- Reversal:
-- DROP TABLE IF EXISTS work_order_tasks;
