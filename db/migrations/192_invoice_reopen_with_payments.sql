-- Migration 192: reopen a partially paid invoice to draft (TASK-154).
-- T&M invoices change after the first payment (true materials + time), so a
-- sent/partial/overdue invoice with payments can go back to draft, be edited,
-- and be re-sent. Payments stay attached; paid_cents never changes on reopen.
--
-- Three functions, each rebuilt from its LIVE definition (see 150 for why):
--   enforce_invoice_immutability — reopen carve-out no longer requires
--     paid_cents = 0 (only that it is unchanged); draft→sent on an invoice
--     that already holds payments lands on partial/paid, not sent.
--   validate_invoice_transition — drops the "only unpaid" reopen block and
--     allows draft→partial/paid only for that re-send case.
--   sync_invoice_on_payment — a payment landing while the invoice is a draft
--     (e.g. an old Square link paid mid-edit) updates paid_cents but keeps it
--     draft; status is settled when it is re-sent.

CREATE OR REPLACE FUNCTION enforce_invoice_immutability()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- View-only updates never touch money or lifecycle fields (157).
  IF (
    old.status IN ('sent', 'partial', 'overdue')
    AND new.status                 IS NOT DISTINCT FROM old.status
    AND new.client_id              IS NOT DISTINCT FROM old.client_id
    AND new.job_id                 IS NOT DISTINCT FROM old.job_id
    AND new.estimate_id            IS NOT DISTINCT FROM old.estimate_id
    AND new.property_id            IS NOT DISTINCT FROM old.property_id
    AND new.invoice_number         IS NOT DISTINCT FROM old.invoice_number
    AND new.invoice_kind           IS NOT DISTINCT FROM old.invoice_kind
    AND new.subtotal_cents         IS NOT DISTINCT FROM old.subtotal_cents
    AND new.tax_cents              IS NOT DISTINCT FROM old.tax_cents
    AND new.total_cents            IS NOT DISTINCT FROM old.total_cents
    AND new.paid_cents             IS NOT DISTINCT FROM old.paid_cents
    AND new.deposit_cents          IS NOT DISTINCT FROM old.deposit_cents
    AND new.balance_cents          IS NOT DISTINCT FROM old.balance_cents
    AND new.deposit_type           IS NOT DISTINCT FROM old.deposit_type
    AND new.deposit_percentage     IS NOT DISTINCT FROM old.deposit_percentage
    AND new.deposit_fixed_cents    IS NOT DISTINCT FROM old.deposit_fixed_cents
    AND new.deposit_paid_at        IS NOT DISTINCT FROM old.deposit_paid_at
    AND new.square_order_id        IS NOT DISTINCT FROM old.square_order_id
    AND new.square_checkout_id     IS NOT DISTINCT FROM old.square_checkout_id
    AND new.square_payment_link_url IS NOT DISTINCT FROM old.square_payment_link_url
    AND new.notes                  IS NOT DISTINCT FROM old.notes
    AND new.due_date               IS NOT DISTINCT FROM old.due_date
    AND new.sent_at                IS NOT DISTINCT FROM old.sent_at
    AND new.paid_at                IS NOT DISTINCT FROM old.paid_at
    AND new.share_token            IS NOT DISTINCT FROM old.share_token
    AND new.created_by             IS NOT DISTINCT FROM old.created_by
    AND new.updated_at             IS NOT DISTINCT FROM old.updated_at
    AND (
      new.first_viewed_at IS DISTINCT FROM old.first_viewed_at
      OR new.last_viewed_at IS DISTINCT FROM old.last_viewed_at
      OR new.view_count IS DISTINCT FROM old.view_count
    )
  ) THEN
    RETURN new;
  END IF;

  -- Re-send of a reopened invoice that already holds payments (192): it is
  -- not merely "sent" — settle it against what has been paid.
  IF new.status = 'sent' AND old.status = 'draft' AND new.paid_cents > 0 THEN
    new.status := CASE
      WHEN new.paid_cents + GREATEST(COALESCE(new.deposit_cents, 0), 0) >= new.total_cents THEN 'paid'
      ELSE 'partial'
    END;
  END IF;

  IF new.status IN ('sent', 'partial', 'paid') AND old.status = 'draft' THEN
    new.sent_at := COALESCE(new.sent_at, now());
  END IF;

  IF new.status = 'paid' AND old.status != 'paid' THEN
    new.paid_at := COALESCE(new.paid_at, now());
  END IF;

  -- Reopen sent/partial/overdue invoices to draft for correction (112, 192).
  -- Payments stay attached: paid_cents must not change on the reopen itself.
  IF old.status IN ('sent', 'partial', 'overdue') AND new.status = 'draft' AND new.paid_cents = old.paid_cents THEN
    IF (
      new.client_id      IS DISTINCT FROM old.client_id      OR
      new.job_id         IS DISTINCT FROM old.job_id         OR
      new.estimate_id    IS DISTINCT FROM old.estimate_id    OR
      new.property_id    IS DISTINCT FROM old.property_id    OR
      new.invoice_number IS DISTINCT FROM old.invoice_number OR
      new.subtotal_cents IS DISTINCT FROM old.subtotal_cents OR
      new.tax_cents      IS DISTINCT FROM old.tax_cents      OR
      new.total_cents    IS DISTINCT FROM old.total_cents    OR
      new.notes          IS DISTINCT FROM old.notes          OR
      new.due_date       IS DISTINCT FROM old.due_date       OR
      new.created_by     IS DISTINCT FROM old.created_by
    ) THEN
      RAISE EXCEPTION
        'invoice reopen to draft may only change status and sent_at'
        USING errcode = 'P0001';
    END IF;

    new.sent_at := NULL;
    RETURN new;
  END IF;

  -- Document link correction: client, project, or service property only (146).
  IF (
    old.status != 'void'
    AND new.status              IS NOT DISTINCT FROM old.status
    AND new.invoice_number  IS NOT DISTINCT FROM old.invoice_number
    AND new.subtotal_cents  IS NOT DISTINCT FROM old.subtotal_cents
    AND new.tax_cents       IS NOT DISTINCT FROM old.tax_cents
    AND new.total_cents     IS NOT DISTINCT FROM old.total_cents
    AND new.paid_cents      IS NOT DISTINCT FROM old.paid_cents
    AND new.deposit_cents   IS NOT DISTINCT FROM old.deposit_cents
    AND new.balance_cents   IS NOT DISTINCT FROM old.balance_cents
    AND new.notes           IS NOT DISTINCT FROM old.notes
    AND new.due_date        IS NOT DISTINCT FROM old.due_date
    AND new.sent_at         IS NOT DISTINCT FROM old.sent_at
    AND new.paid_at         IS NOT DISTINCT FROM old.paid_at
    AND new.estimate_id     IS NOT DISTINCT FROM old.estimate_id
    AND new.created_by      IS NOT DISTINCT FROM old.created_by
    AND (
      new.client_id   IS DISTINCT FROM old.client_id
      OR new.job_id  IS DISTINCT FROM old.job_id
      OR new.property_id IS DISTINCT FROM old.property_id
    )
  ) THEN
    RETURN new;
  END IF;

  -- in sent / partial / overdue: only paid_cents + status may change,
  -- plus a one-time due_date fill when old.due_date is null (149).
  IF old.status IN ('sent', 'partial', 'overdue') THEN
    IF (
      new.client_id        IS DISTINCT FROM old.client_id        OR
      new.job_id           IS DISTINCT FROM old.job_id           OR
      new.estimate_id      IS DISTINCT FROM old.estimate_id      OR
      new.property_id      IS DISTINCT FROM old.property_id      OR
      new.invoice_number   IS DISTINCT FROM old.invoice_number   OR
      new.subtotal_cents   IS DISTINCT FROM old.subtotal_cents   OR
      new.tax_cents        IS DISTINCT FROM old.tax_cents        OR
      new.total_cents      IS DISTINCT FROM old.total_cents      OR
      new.notes            IS DISTINCT FROM old.notes            OR
      (
        new.due_date IS DISTINCT FROM old.due_date
        AND NOT (old.due_date IS NULL AND new.due_date IS NOT NULL)
      ) OR
      new.sent_at          IS DISTINCT FROM old.sent_at          OR
      new.created_by       IS DISTINCT FROM old.created_by
    ) THEN
      RAISE EXCEPTION
        'invoice in % state: only paid_cents, status, and one-time due_date fill may be updated', old.status
        USING errcode = 'P0001';
    END IF;
  END IF;

  IF old.status IN ('paid', 'void') THEN
    RAISE EXCEPTION
      'invoice in % state is immutable', old.status
      USING errcode = 'P0001';
  END IF;

  RETURN new;
END;
$$;

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

CREATE OR REPLACE FUNCTION sync_invoice_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  -- Fully paid when payments on this invoice + deposit credit cover the total.
  -- A draft (reopened for edit) stays draft; re-send settles it (192).
  new_status := CASE
    WHEN inv.status = 'draft' THEN 'draft'
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
$$;

-- ── Reversal plan ────────────────────────────────────────────────────────────
-- Forward-only runner. To reverse, re-run the three function bodies from
-- 157 (enforce_invoice_immutability), 112/150 (validate_invoice_transition,
-- with the paid_cents <> 0 reopen block), and 164 (sync_invoice_on_payment).
-- Invoices already reopened with payments keep their data; they simply can't
-- be reopened again.
