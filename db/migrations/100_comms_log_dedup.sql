-- Migration 100: communications_log idempotency
--
-- The SMS intake pipeline records every inbound message in communications_log
-- keyed by external_id (the SMS Gateway messageId). The gateway can re-deliver
-- the same webhook (retries, double-fire), which without a uniqueness guard
-- would create duplicate log rows and re-run downstream actions. Mirrors the
-- Stripe payment idempotency pattern in migration 074.
--
-- Partial unique index: scoped per account, only enforced when external_id is
-- set (other channels / manual logs may have a null external_id). Safe on
-- existing data — current rows have null external_id or are already unique.

CREATE UNIQUE INDEX IF NOT EXISTS comms_log_account_external_id_key
  ON communications_log (account_id, external_id)
  WHERE external_id IS NOT NULL;
