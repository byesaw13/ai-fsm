-- Migration 218: the database refuses a second open billing invoice (TASK-247).
--
-- Six code paths created invoices with different "already exists?" checks. A
-- manual invoice on a job is kind 'final' with no estimate_id, so Convert (which
-- only checked finals for the estimate) could add a second final for the same
-- job. These indexes make the rule hold whatever path writes:
--   one open (non-void) final or standard invoice per job;
--   one open final per estimate (the 104 index, now ignoring void so a voided
--     final can be replaced);
--   one open deposit per estimate.
-- Production check 2026-11-24: no rows violate any of them.

DROP INDEX IF EXISTS idx_invoices_one_final_per_estimate;
CREATE UNIQUE INDEX idx_invoices_one_final_per_estimate
  ON invoices (estimate_id)
  WHERE invoice_kind = 'final' AND estimate_id IS NOT NULL AND status <> 'void';

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_one_final_per_job
  ON invoices (job_id)
  WHERE invoice_kind IN ('final', 'standard') AND job_id IS NOT NULL AND status <> 'void';

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_one_deposit_per_estimate
  ON invoices (estimate_id)
  WHERE invoice_kind = 'deposit' AND estimate_id IS NOT NULL AND status <> 'void';

-- ── Reversal ────────────────────────────────────────────────────────────────
--   DROP INDEX IF EXISTS idx_invoices_one_final_per_job;
--   DROP INDEX IF EXISTS idx_invoices_one_deposit_per_estimate;
--   DROP INDEX IF EXISTS idx_invoices_one_final_per_estimate;
--   CREATE UNIQUE INDEX idx_invoices_one_final_per_estimate ON invoices (estimate_id)
--     WHERE invoice_kind = 'final' AND estimate_id IS NOT NULL;
-- No data changes.
