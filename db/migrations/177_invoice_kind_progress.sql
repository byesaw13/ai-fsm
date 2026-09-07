-- 177_invoice_kind_progress.sql
-- Add 'progress' to the invoice_kind vocabulary (TASK-120, A0b staged billing).
--
-- Long jobs are billed in stages: a deposit up front, one or more progress
-- invoices at the midpoint, and a final invoice at completion. A progress
-- invoice bills its own amount now (like a deposit); the final invoice credits
-- both deposit AND progress invoices so the stages sum to exactly the project
-- total (see lib/invoices/billing.ts reconcileFinalInvoice).
--
-- Additive + idempotent + reversible: the constraint is widened, never
-- narrowed, so no existing row can violate it. Re-runnable.

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_invoice_kind_check;

ALTER TABLE invoices
  ADD CONSTRAINT invoices_invoice_kind_check
    CHECK (invoice_kind IN ('standard', 'deposit', 'final', 'progress'));
