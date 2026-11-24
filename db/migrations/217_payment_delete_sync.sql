-- Migration 217: deleting a payment updates the invoice through the trigger (TASK-246).
--
-- Until now sync_invoice_on_payment fired only on INSERT and UPDATE OF status,
-- and DELETE /api/v1/payments/[id] recalculated paid_cents and status by hand.
-- That copy had drifted: removing the last payment on a partial invoice set
-- status 'sent', which validate_invoice_transition rejects (partial → sent), so
-- the delete failed with a 500.
--
-- Two functions, rebuilt from their live definitions (192):
--   sync_invoice_on_payment — also runs on DELETE. Only a deleted *paid*
--     payment changes the invoice. A paid or void invoice, or one already gone
--     (cascade from an invoice delete), is left alone. No paid money left on a
--     partial invoice → 'sent', paid_at cleared.
--   validate_invoice_transition — allows partial → sent only when paid_cents
--     becomes 0.

CREATE OR REPLACE FUNCTION sync_invoice_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  inv         invoices%rowtype;
  inv_id      uuid;
  new_paid    integer;
  new_status  text;
  credit      integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Pending links and refund rows never counted toward paid_cents.
    IF old.status <> 'paid' THEN
      RETURN old;
    END IF;
    inv_id := old.invoice_id;
  ELSE
    inv_id := new.invoice_id;
  END IF;

  SELECT * INTO inv FROM invoices WHERE id = inv_id FOR UPDATE;

  IF NOT FOUND THEN
    -- Invoice deleted in the same statement (payments cascade).
    IF TG_OP = 'DELETE' THEN
      RETURN old;
    END IF;
    RAISE EXCEPTION 'invoice % not found', inv_id;
  END IF;

  -- The app refuses payment deletes on paid and void invoices; direct deletes
  -- (cleanup, cascades) leave those invoices as they are.
  IF TG_OP = 'DELETE' AND inv.status IN ('paid', 'void') THEN
    RETURN old;
  END IF;

  -- Sum only completed payments for this invoice
  SELECT COALESCE(SUM(amount_cents), 0) INTO new_paid
  FROM payments
  WHERE invoice_id = inv_id
    AND status = 'paid';

  credit := GREATEST(COALESCE(inv.deposit_cents, 0), 0);

  -- Fully paid when payments on this invoice + deposit credit cover the total.
  -- A draft (reopened for edit) stays draft; re-send settles it (192).
  -- A partial invoice whose last payment was deleted is back to sent (217).
  new_status := CASE
    WHEN inv.status = 'draft' THEN 'draft'
    WHEN new_paid + credit >= inv.total_cents THEN 'paid'
    WHEN new_paid > 0 THEN 'partial'
    WHEN inv.status = 'partial' THEN 'sent'
    ELSE inv.status
  END;

  -- No-op guard: skip UPDATE when nothing changes (pending links / refunds on paid)
  IF new_paid = inv.paid_cents AND new_status = inv.status THEN
    RETURN COALESCE(new, old);
  END IF;

  UPDATE invoices
  SET
    paid_cents = new_paid,
    status     = new_status,
    paid_at    = CASE
                   WHEN new_status = 'paid' THEN now()
                   WHEN TG_OP = 'DELETE' THEN NULL
                   ELSE paid_at
                 END
  WHERE id = inv_id;

  RETURN COALESCE(new, old);
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_sync_invoice ON payments;
CREATE TRIGGER trg_payment_sync_invoice
  AFTER INSERT OR DELETE OR UPDATE OF status ON payments
  FOR EACH ROW EXECUTE FUNCTION sync_invoice_on_payment();

CREATE OR REPLACE FUNCTION validate_invoice_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  allowed text[];
BEGIN
  IF new.status = old.status THEN
    RETURN new;
  END IF;

  allowed := CASE old.status
    WHEN 'draft'   THEN ARRAY['sent', 'void']
    WHEN 'sent'    THEN ARRAY['draft', 'partial', 'paid', 'overdue', 'void']
    WHEN 'partial' THEN ARRAY['draft', 'paid', 'overdue', 'void']
    WHEN 'overdue' THEN ARRAY['draft', 'partial', 'paid', 'void']
    WHEN 'paid'    THEN ARRAY[]::text[]
    WHEN 'void'    THEN ARRAY[]::text[]
    ELSE                ARRAY[]::text[]
  END;

  -- Re-send of a reopened invoice that holds payments (192).
  IF old.status = 'draft' AND old.paid_cents > 0 THEN
    allowed := allowed || ARRAY['partial', 'paid'];
  END IF;

  -- Last payment deleted from a partial invoice (217).
  IF old.status = 'partial' AND new.paid_cents = 0 THEN
    allowed := allowed || ARRAY['sent'];
  END IF;

  IF NOT (new.status = ANY(allowed)) THEN
    RAISE EXCEPTION
      'invalid invoice transition: % → % (allowed: %)',
      old.status, new.status, array_to_string(allowed, ', ')
      USING errcode = 'P0001';
  END IF;

  -- Reopen keeps payments attached; it may never rewrite what was paid.
  IF new.status = 'draft' AND old.status IN ('sent', 'partial', 'overdue')
     AND new.paid_cents IS DISTINCT FROM old.paid_cents THEN
    RAISE EXCEPTION
      'invoice reopen to draft may not change paid_cents'
      USING errcode = 'P0001';
  END IF;

  RETURN new;
END;
$$;

-- ── Reversal ────────────────────────────────────────────────────────────────
-- Forward-only runner. To reverse:
--   DROP TRIGGER IF EXISTS trg_payment_sync_invoice ON payments;
--   CREATE TRIGGER trg_payment_sync_invoice
--     AFTER INSERT OR UPDATE OF status ON payments
--     FOR EACH ROW EXECUTE FUNCTION sync_invoice_on_payment();
-- then re-run the sync_invoice_on_payment and validate_invoice_transition
-- bodies from 192, and revert the payments route to its own recalculation.
-- No data changes; invoices keep their current paid_cents and status.
