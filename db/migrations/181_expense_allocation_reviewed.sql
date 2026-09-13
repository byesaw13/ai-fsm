-- TASK-144: receipt destinations that are not a client job.
-- reviewed_at takes the row out of receipt-review. allocation names the bucket.

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS allocation TEXT;

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS billable BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE expenses
  DROP CONSTRAINT IF EXISTS expenses_allocation_check;

ALTER TABLE expenses
  ADD CONSTRAINT expenses_allocation_check
  CHECK (
    allocation IS NULL
    OR allocation IN ('job', 'truck', 'stock', 'tools', 'overhead')
  );

COMMENT ON COLUMN expenses.reviewed_at IS
  'When set, receipt-review will not show this expense. Used for truck/stock/tools/overhead and for linked jobs.';

COMMENT ON COLUMN expenses.allocation IS
  'Where this spend lives: job (job_id set), truck, stock, tools, overhead. Not a fake project.';

COMMENT ON COLUMN expenses.billable IS
  'False for truck/stock/tools/overhead and for books-only links to already-invoiced jobs. Invoice rollups skip these.';

CREATE INDEX IF NOT EXISTS idx_expenses_unreviewed
  ON expenses (account_id, expense_date DESC)
  WHERE job_id IS NULL AND reviewed_at IS NULL;

-- Reversal:
-- DROP INDEX IF EXISTS idx_expenses_unreviewed;
-- ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_allocation_check;
-- ALTER TABLE expenses DROP COLUMN IF EXISTS allocation;
-- ALTER TABLE expenses DROP COLUMN IF EXISTS reviewed_at;
