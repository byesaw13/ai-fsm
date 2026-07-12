-- Repair: migration 149 initially replaced enforce_invoice_immutability from an
-- older base and dropped reopen-to-draft (112) + document-link (146) carveouts.
-- Re-apply the full function: 112 + 146 + one-time due_date null fill.

CREATE OR REPLACE FUNCTION enforce_invoice_immutability()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF new.status = 'sent' AND old.status = 'draft' THEN
    new.sent_at := COALESCE(new.sent_at, now());
  END IF;

  IF new.status = 'paid' AND old.status != 'paid' THEN
    new.paid_at := COALESCE(new.paid_at, now());
  END IF;

  -- Reopen unpaid sent/partial/overdue invoices to draft for correction (112).
  IF old.status IN ('sent', 'partial', 'overdue') AND new.status = 'draft' AND old.paid_cents = 0 AND new.paid_cents = 0 THEN
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
