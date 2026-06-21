-- Migration 117: Payment provider model + enriched recorder (EPIC-004 / TASK-034)
--
-- Extends the thin payments model so Dovetails OS is the source of truth for
-- deposits, balances, and payment history across every channel (Venmo, cash,
-- check, Zelle, ACH) and leaves room for external providers (Square first).
--
-- All additive: new nullable/defaulted columns, backfilled from existing data.
-- The sync trigger is replaced (CREATE OR REPLACE) but preserves behavior for
-- existing rows because the backfill marks every current payment status='paid'.

-- === payments: provider + classification columns ===
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS job_id                uuid REFERENCES jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS customer_id           uuid REFERENCES clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status                text NOT NULL DEFAULT 'paid'
    CHECK (status IN ('pending','paid','failed','refunded','cancelled')),
  ADD COLUMN IF NOT EXISTS payment_type          text NOT NULL DEFAULT 'progress'
    CHECK (payment_type IN ('deposit','progress','final','refund','adjustment')),
  ADD COLUMN IF NOT EXISTS external_provider     text,
  ADD COLUMN IF NOT EXISTS external_payment_id   text,
  ADD COLUMN IF NOT EXISTS external_checkout_url text,
  ADD COLUMN IF NOT EXISTS paid_at               timestamptz;

-- Backfill from existing data: every legacy payment is a completed payment,
-- and inherits its invoice's job/client so rollups by job/customer work.
UPDATE payments p
SET
  paid_at     = COALESCE(p.paid_at, p.received_at),
  customer_id = COALESCE(p.customer_id, i.client_id),
  job_id      = COALESCE(p.job_id, i.job_id)
FROM invoices i
WHERE p.invoice_id = i.id
  AND (p.paid_at IS NULL OR p.customer_id IS NULL OR (p.job_id IS NULL AND i.job_id IS NOT NULL));

-- Idempotency for provider webhooks (mirror payments_stripe_pi_id_key, 074).
CREATE UNIQUE INDEX IF NOT EXISTS payments_external_id_key
  ON payments (external_provider, external_payment_id)
  WHERE external_provider IS NOT NULL AND external_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_job        ON payments (job_id)      WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_customer   ON payments (customer_id) WHERE customer_id IS NOT NULL;

-- === invoices: Square reference columns (paid_cents/balance_cents/status already exist) ===
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS square_order_id         text,
  ADD COLUMN IF NOT EXISTS square_checkout_id      text,
  ADD COLUMN IF NOT EXISTS square_payment_link_url text;

-- === sync trigger: only completed payments credit the invoice ===
-- A pending Square link inserts a payments row but must NOT move the balance
-- until the webhook flips it to status='paid'. Refunds (status='refunded') are
-- tracked as separate rows and do not count toward paid_cents here; net-of-
-- refund math is presentational.
CREATE OR REPLACE FUNCTION sync_invoice_on_payment()
returns trigger language plpgsql security definer
  set search_path = public
as $$
declare
  inv         invoices%rowtype;
  new_paid    integer;
  new_status  text;
begin
  select * into inv from invoices where id = new.invoice_id for update;

  if not found then
    raise exception 'invoice % not found', new.invoice_id;
  end if;

  -- sum only completed payments for this invoice
  select coalesce(sum(amount_cents), 0) into new_paid
  from payments
  where invoice_id = new.invoice_id
    and status = 'paid';

  -- derive new status
  new_status := case
    when new_paid >= inv.total_cents then 'paid'
    when new_paid > 0               then 'partial'
    else inv.status   -- no change (e.g. total_cents is 0, or only pending rows)
  end;

  -- No-op guard: skip the UPDATE entirely when nothing changes. This is what
  -- lets ledger-only rows (pending links, refunds) be inserted against a
  -- terminal/paid invoice without tripping enforce_invoice_immutability — that
  -- BEFORE-UPDATE trigger fires on the UPDATE below regardless of security
  -- definer (security definer changes privileges/RLS, not trigger firing).
  if new_paid = inv.paid_cents and new_status = inv.status then
    return new;
  end if;

  -- update paid_cents + status directly (a real change, e.g. payment completes)
  update invoices
  set
    paid_cents = new_paid,
    status     = new_status,
    paid_at    = case when new_status = 'paid' then now() else paid_at end
  where id = new.invoice_id;

  return new;
end;
$$;

-- Fire on INSERT (new payment) and on UPDATE of status (webhook completes a
-- pending payment). The original trigger was INSERT-only.
DROP TRIGGER IF EXISTS trg_payment_sync_invoice ON payments;
CREATE TRIGGER trg_payment_sync_invoice
  AFTER INSERT OR UPDATE OF status ON payments
  FOR EACH ROW EXECUTE FUNCTION sync_invoice_on_payment();

-- Rollback:
-- DROP TRIGGER IF EXISTS trg_payment_sync_invoice ON payments;
-- CREATE TRIGGER trg_payment_sync_invoice AFTER INSERT ON payments
--   FOR EACH ROW EXECUTE FUNCTION sync_invoice_on_payment();
-- (restore the 004 function body that sums all payments)
-- DROP INDEX IF EXISTS payments_external_id_key, idx_payments_job, idx_payments_customer;
-- ALTER TABLE invoices DROP COLUMN IF EXISTS square_order_id, DROP COLUMN IF EXISTS square_checkout_id, DROP COLUMN IF EXISTS square_payment_link_url;
-- ALTER TABLE payments DROP COLUMN IF EXISTS job_id, ... (all added columns)
