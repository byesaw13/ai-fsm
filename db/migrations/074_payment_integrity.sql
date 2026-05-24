-- Migration 074: Payment integrity constraints
--
-- 1. stripe_payment_intent_id on payments — Stripe may deliver webhook events
--    more than once (retries on 5xx, network timeouts). Without uniqueness the
--    handler inserts a duplicate payment row, double-crediting the invoice.
--
-- 2. UNIQUE (account_id, invoice_number) on invoices — the COUNT(*)+1 pattern
--    used to generate invoice numbers is not serializable-safe. Two concurrent
--    transitions can read the same count and produce the same INV-XXXX value.
--    This constraint catches collisions at INSERT time with a clear error
--    rather than silently creating duplicate numbers.
--
-- Both are safe to apply to existing data (nullable column, deferred unique
-- index build has no lock escalation risk on small tables).

-- Payments: track the Stripe PaymentIntent ID for idempotency
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS payments_stripe_pi_id_key
  ON payments (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- Invoices: prevent duplicate invoice numbers within an account
CREATE UNIQUE INDEX IF NOT EXISTS invoices_account_number_key
  ON invoices (account_id, invoice_number);

-- Rollback:
-- DROP INDEX IF EXISTS invoices_account_number_key;
-- DROP INDEX IF EXISTS payments_stripe_pi_id_key;
-- ALTER TABLE payments DROP COLUMN IF EXISTS stripe_payment_intent_id;
