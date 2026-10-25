-- Migration 205: the option a customer chose on a multi-option estimate (TASK-181).
-- Approval of a Good/Better/Best estimate records which option was picked; the
-- estimate's totals and deposit follow that option. NULL for standard estimates
-- and for anything approved before this migration.
-- Additive only.

ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS selected_option_id UUID REFERENCES estimate_options(id) ON DELETE SET NULL;

-- Reversal:
-- ALTER TABLE estimates DROP COLUMN IF EXISTS selected_option_id;
