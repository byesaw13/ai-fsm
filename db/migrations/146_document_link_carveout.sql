-- Allow client/job/property link corrections on invoices and estimates without
-- mutating priced content. Fixes wrong or missing document addresses on paid
-- invoices and approved estimates.

CREATE OR REPLACE FUNCTION enforce_invoice_immutability()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF new.status = 'sent' AND old.status = 'draft' THEN
    new.sent_at := COALESCE(new.sent_at, now());
  END IF;

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

  -- Document link correction: client, project, or service property only.
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

  IF old.status IN ('paid', 'void') THEN
    RAISE EXCEPTION
      'invoice in % state is immutable', old.status
      USING errcode = 'P0001';
  END IF;

  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_estimate_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF new.status = 'sent' AND old.status = 'draft' THEN
    new.sent_at := COALESCE(new.sent_at, now());
  END IF;

  -- Document link correction on sent estimates.
  IF old.status = 'sent' AND (
    new.status              IS NOT DISTINCT FROM old.status
    AND new.subtotal_cents  IS NOT DISTINCT FROM old.subtotal_cents
    AND new.tax_cents       IS NOT DISTINCT FROM old.tax_cents
    AND new.total_cents     IS NOT DISTINCT FROM old.total_cents
    AND new.deposit_cents   IS NOT DISTINCT FROM old.deposit_cents
    AND new.notes           IS NOT DISTINCT FROM old.notes
    AND new.expires_at      IS NOT DISTINCT FROM old.expires_at
    AND new.sent_at         IS NOT DISTINCT FROM old.sent_at
    AND new.created_by      IS NOT DISTINCT FROM old.created_by
    AND (
      new.client_id   IS DISTINCT FROM old.client_id
      OR new.job_id  IS DISTINCT FROM old.job_id
      OR new.property_id IS DISTINCT FROM old.property_id
      OR new.internal_notes IS DISTINCT FROM old.internal_notes
    )
  ) THEN
    RETURN new;
  END IF;

  IF old.status = 'sent' THEN
    IF (
      new.client_id        IS DISTINCT FROM old.client_id        OR
      new.job_id           IS DISTINCT FROM old.job_id           OR
      new.property_id      IS DISTINCT FROM old.property_id      OR
      new.subtotal_cents   IS DISTINCT FROM old.subtotal_cents   OR
      new.tax_cents        IS DISTINCT FROM old.tax_cents        OR
      new.total_cents      IS DISTINCT FROM old.total_cents      OR
      new.notes            IS DISTINCT FROM old.notes            OR
      new.expires_at       IS DISTINCT FROM old.expires_at       OR
      new.sent_at          IS DISTINCT FROM old.sent_at          OR
      new.created_by       IS DISTINCT FROM old.created_by
    ) THEN
      RAISE EXCEPTION
        'estimate in sent state: only internal_notes may be updated'
        USING errcode = 'P0001';
    END IF;
  END IF;

  -- Terminal states: priced content immutable; document links may be corrected.
  IF old.status IN ('approved', 'declined', 'expired') THEN
    IF (
      new.status              IS NOT DISTINCT FROM old.status
      AND new.subtotal_cents  IS NOT DISTINCT FROM old.subtotal_cents
      AND new.tax_cents       IS NOT DISTINCT FROM old.tax_cents
      AND new.total_cents     IS NOT DISTINCT FROM old.total_cents
      AND new.deposit_cents   IS NOT DISTINCT FROM old.deposit_cents
      AND new.notes           IS NOT DISTINCT FROM old.notes
      AND new.expires_at      IS NOT DISTINCT FROM old.expires_at
      AND new.sent_at         IS NOT DISTINCT FROM old.sent_at
      AND new.created_by      IS NOT DISTINCT FROM old.created_by
      AND (
        new.client_id   IS DISTINCT FROM old.client_id
        OR new.job_id  IS DISTINCT FROM old.job_id
        OR new.property_id IS DISTINCT FROM old.property_id
      )
    ) THEN
      RETURN new;
    END IF;

    -- One-time NULL→value job link (existing carveout).
    IF (
      old.job_id IS NULL
      AND new.job_id IS NOT NULL
      AND new.status        IS NOT DISTINCT FROM old.status
      AND new.client_id     IS NOT DISTINCT FROM old.client_id
      AND new.property_id   IS NOT DISTINCT FROM old.property_id
      AND new.subtotal_cents IS NOT DISTINCT FROM old.subtotal_cents
      AND new.tax_cents     IS NOT DISTINCT FROM old.tax_cents
      AND new.total_cents   IS NOT DISTINCT FROM old.total_cents
      AND new.deposit_cents IS NOT DISTINCT FROM old.deposit_cents
      AND new.notes         IS NOT DISTINCT FROM old.notes
    ) THEN
      RETURN new;
    END IF;

    RAISE EXCEPTION
      'estimate in % state is immutable', old.status
      USING errcode = 'P0001';
  END IF;

  RETURN new;
END;
$function$;