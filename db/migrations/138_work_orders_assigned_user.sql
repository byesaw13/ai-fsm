-- ponytail: lead tech on work order only; visit crew/helpers deferred

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_work_orders_assigned_user
  ON work_orders (account_id, assigned_user_id)
  WHERE assigned_user_id IS NOT NULL;

UPDATE work_orders wo
SET assigned_user_id = sub.assigned_user_id
FROM (
  SELECT DISTINCT ON (work_order_id) work_order_id, assigned_user_id
  FROM visits
  WHERE work_order_id IS NOT NULL AND assigned_user_id IS NOT NULL
  ORDER BY work_order_id, scheduled_start DESC
) sub
WHERE wo.id = sub.work_order_id
  AND wo.assigned_user_id IS NULL;