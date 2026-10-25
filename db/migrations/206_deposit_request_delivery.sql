-- Migration 206: automatic deposit request and scheduling on approval (TASK-182).
--
-- invoice_delivery_attempts records every automatic send of an invoice. An
-- attempt is written as 'pending' and committed before the message goes out,
-- then set to 'delivered' or 'failed' (failed = the client was not contacted).
-- A 'pending' row that never resolves, or one marked 'unknown', means the
-- outcome is not known; the app never re-sends those automatically.
--
-- When a deposit invoice becomes paid, the job's open "schedule_job" action
-- item moves to ready to book. Done in the database so every payment path
-- (Square webhook, recorded payment, manual mark-paid) is covered.
-- Additive only; reversal at the bottom.

CREATE TABLE IF NOT EXISTS invoice_delivery_attempts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  invoice_id  UUID        NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  reason      TEXT        NOT NULL DEFAULT 'deposit_request',
  outcome     TEXT        NOT NULL DEFAULT 'pending'
                          CHECK (outcome IN ('pending', 'delivered', 'failed', 'unknown')),
  detail      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_delivery_attempts_invoice
  ON invoice_delivery_attempts (invoice_id, created_at DESC);

-- At most one live (not failed) attempt per invoice: two overlapping approvals
-- cannot both claim a send. Only a 'failed' attempt frees the invoice.
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_delivery_attempts_live
  ON invoice_delivery_attempts (invoice_id)
  WHERE outcome <> 'failed';

ALTER TABLE invoice_delivery_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_delivery_attempts FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'invoice_delivery_attempts' AND policyname = 'invoice_delivery_attempts_select') THEN
    CREATE POLICY invoice_delivery_attempts_select ON invoice_delivery_attempts FOR SELECT
      USING (account_id = app_account_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'invoice_delivery_attempts' AND policyname = 'invoice_delivery_attempts_insert') THEN
    CREATE POLICY invoice_delivery_attempts_insert ON invoice_delivery_attempts FOR INSERT
      WITH CHECK (account_id = app_account_id() AND app_role() IN ('owner', 'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'invoice_delivery_attempts' AND policyname = 'invoice_delivery_attempts_update') THEN
    CREATE POLICY invoice_delivery_attempts_update ON invoice_delivery_attempts FOR UPDATE
      USING (account_id = app_account_id() AND app_role() IN ('owner', 'admin'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION mark_schedule_item_deposit_received()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF new.invoice_kind = 'deposit' AND new.status = 'paid' AND old.status IS DISTINCT FROM 'paid' THEN
    UPDATE action_items
    SET title = 'Schedule this job — deposit received, ready to book'
    WHERE account_id = new.account_id
      AND action_type = 'schedule_job'
      AND resolved_at IS NULL
      AND (
        (entity_type = 'job' AND entity_id = new.job_id)
        OR (entity_type = 'estimate' AND entity_id = new.estimate_id)
      );
  END IF;
  RETURN new;
END;
$function$;

DROP TRIGGER IF EXISTS trg_invoice_deposit_paid_schedule ON invoices;
CREATE TRIGGER trg_invoice_deposit_paid_schedule
  AFTER UPDATE OF status ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION mark_schedule_item_deposit_received();

-- Reversal:
-- DROP TRIGGER IF EXISTS trg_invoice_deposit_paid_schedule ON invoices;
-- DROP FUNCTION IF EXISTS mark_schedule_item_deposit_received();
-- DROP TABLE IF EXISTS invoice_delivery_attempts;
