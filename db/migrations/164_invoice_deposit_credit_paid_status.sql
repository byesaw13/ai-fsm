-- Migration 164: Deposit credit counts toward invoice paid status.
--
-- Final invoices credit a separate deposit invoice via deposit_cents
-- (balance_cents = total_cents - deposit_cents). Payments on the final only
-- cover the remainder, so paid_cents will never reach total_cents when a
-- deposit credit exists. Without this, collecting the true balance left the
-- invoice stuck in "partial" and UIs showed the full total as still due.
--
-- Aligns sync_invoice_on_payment with apps/web/lib/invoices/payments.ts.

CREATE OR REPLACE FUNCTION sync_invoice_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  inv         invoices%rowtype;
  new_paid    integer;
  new_status  text;
  credit      integer;
BEGIN
  SELECT * INTO inv FROM invoices WHERE id = new.invoice_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice % not found', new.invoice_id;
  END IF;

  -- Sum only completed payments for this invoice
  SELECT COALESCE(SUM(amount_cents), 0) INTO new_paid
  FROM payments
  WHERE invoice_id = new.invoice_id
    AND status = 'paid';

  credit := GREATEST(COALESCE(inv.deposit_cents, 0), 0);

  -- Fully paid when payments on this invoice + deposit credit cover the total
  new_status := CASE
    WHEN new_paid + credit >= inv.total_cents THEN 'paid'
    WHEN new_paid > 0 THEN 'partial'
    ELSE inv.status
  END;

  -- No-op guard: skip UPDATE when nothing changes (pending links / refunds on paid)
  IF new_paid = inv.paid_cents AND new_status = inv.status THEN
    RETURN new;
  END IF;

  UPDATE invoices
  SET
    paid_cents = new_paid,
    status     = new_status,
    paid_at    = CASE WHEN new_status = 'paid' THEN now() ELSE paid_at END
  WHERE id = new.invoice_id;

  RETURN new;
END;
$function$;

-- Rollback:
-- Restore body from migration 117 (compare new_paid >= inv.total_cents only).
