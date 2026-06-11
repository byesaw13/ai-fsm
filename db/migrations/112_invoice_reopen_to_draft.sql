-- Allow unpaid sent invoices to be reopened to draft for correction/resend.

CREATE OR REPLACE FUNCTION enforce_invoice_immutability()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- entering sent: auto-set sent_at
  IF new.status = 'sent' AND old.status = 'draft' THEN
    new.sent_at := COALESCE(new.sent_at, now());
  END IF;

  -- entering paid: auto-set paid_at
  IF new.status = 'paid' AND old.status != 'paid' THEN
    new.paid_at := COALESCE(new.paid_at, now());
  END IF;

  -- Reopen unpaid sent/partial/overdue invoices to draft for correction.
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

  -- in sent / partial / overdue: only paid_cents + status may change
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
      new.due_date         IS DISTINCT FROM old.due_date         OR
      new.sent_at          IS DISTINCT FROM old.sent_at          OR
      new.created_by       IS DISTINCT FROM old.created_by
    ) THEN
      RAISE EXCEPTION
        'invoice in % state: only paid_cents and status may be updated', old.status
        USING errcode = 'P0001';
    END IF;
  END IF;

  -- terminal states: fully immutable
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

  IF NOT (new.status = ANY(allowed)) THEN
    RAISE EXCEPTION
      'invalid invoice transition: % → % (allowed: %)',
      old.status, new.status, array_to_string(allowed, ', ')
      USING errcode = 'P0001';
  END IF;

  IF new.status = 'draft' AND old.status IN ('sent', 'partial', 'overdue') AND old.paid_cents <> 0 THEN
    RAISE EXCEPTION
      'only unpaid invoices may be reopened to draft'
      USING errcode = 'P0001';
  END IF;

  RETURN new;
END;
$$;
