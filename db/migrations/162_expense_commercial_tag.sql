-- Migration 162: commercial tags on expenses for Job Ledger Schedule A/B
-- in_allowance | supply_gap | scope_add | equipment

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS commercial_tag TEXT NULL;

ALTER TABLE expenses
  DROP CONSTRAINT IF EXISTS expenses_commercial_tag_check;

ALTER TABLE expenses
  ADD CONSTRAINT expenses_commercial_tag_check
  CHECK (
    commercial_tag IS NULL
    OR commercial_tag IN ('in_allowance', 'supply_gap', 'scope_add', 'equipment')
  );

COMMENT ON COLUMN expenses.commercial_tag IS
  'Job Ledger commercial classification: in_allowance (Schedule A), supply_gap (Schedule B), scope_add, equipment (lift/rental).';

CREATE INDEX IF NOT EXISTS idx_expenses_job_commercial_tag
  ON expenses (job_id, commercial_tag)
  WHERE job_id IS NOT NULL AND commercial_tag IS NOT NULL;
