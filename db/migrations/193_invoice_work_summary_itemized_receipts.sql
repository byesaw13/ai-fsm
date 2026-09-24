-- Migration 193: invoice work summary + itemized receipts link (TASK-157).
-- - expense_line_items.billable: exclude single receipt items (drinks, storage,
--   items billed elsewhere) from client billing and the itemized page.
-- - invoices.work_summary: room-by-room "Work completed" text (draft-only).
-- - invoices.show_itemized_receipts: owner opt-in for the public receipts page.
-- enforce_invoice_immutability is rebuilt from its LIVE definition (192) with
-- the two new invoice columns frozen exactly like notes (see 150 for why).

ALTER TABLE expense_line_items
  ADD COLUMN IF NOT EXISTS billable boolean NOT NULL DEFAULT true;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS work_summary text,
  ADD COLUMN IF NOT EXISTS show_itemized_receipts boolean NOT NULL DEFAULT false;

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
    AND new.work_summary           IS NOT DISTINCT FROM old.work_summary
    AND new.show_itemized_receipts IS NOT DISTINCT FROM old.show_itemized_receipts
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
      new.work_summary   IS DISTINCT FROM old.work_summary   OR
      new.show_itemized_receipts IS DISTINCT FROM old.show_itemized_receipts OR
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
    AND new.work_summary    IS NOT DISTINCT FROM old.work_summary
    AND new.show_itemized_receipts IS NOT DISTINCT FROM old.show_itemized_receipts
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
      new.work_summary     IS DISTINCT FROM old.work_summary     OR
      new.show_itemized_receipts IS DISTINCT FROM old.show_itemized_receipts OR
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

-- ── Reversal plan ────────────────────────────────────────────────────────────
-- Forward-only runner. To reverse: re-run enforce_invoice_immutability from 192,
-- then DROP COLUMN expense_line_items.billable, invoices.work_summary,
-- invoices.show_itemized_receipts (loses the summaries and item flags only).
