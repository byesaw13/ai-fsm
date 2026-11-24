-- Migration 219: invoice lock rules in one place (TASK-251).
--
-- enforce_invoice_immutability was re-pasted whole by eight migrations (112,
-- 146, 149, 150, 157, 192, 193, 194). Each new invoice column had to be added
-- to four separate lists. Now:
--   invoice_document_columns()  — what the customer sees on the invoice. A new
--                                 column of that kind is added HERE, once.
--   invoice_changed(old, new, cols) — did any of these columns change?
-- Each exception below is "these columns stay put", built from that list.
--
-- One fix: the old lists compared balance_cents, a generated column. In a
-- BEFORE trigger NEW's generated columns are not computed yet (NULL), so those
-- comparisons were always "changed" and two exceptions never matched:
--   * the document-link fix (146): relinking a paid invoice to the right job or
--     property was refused;
--   * the customer-view branch (157): sent invoices still recorded views via
--     the general sent-invoice rule, paid ones would not (the app only records
--     views on sent/partial/overdue, so nothing failed in use).
-- balance_cents is total_cents - deposit_cents, both compared, so leaving it
-- out loses nothing.

CREATE OR REPLACE FUNCTION invoice_document_columns()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY[
    'invoice_number', 'subtotal_cents', 'tax_cents', 'total_cents',
    'notes', 'work_summary', 'show_itemized_receipts',
    'billing_context', 'sponsored_purpose', 'beneficiary_property_contact_id',
    'business_purpose', 'created_by'
  ]
$$;

CREATE OR REPLACE FUNCTION invoice_changed(o invoices, n invoices, cols text[])
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM unnest(cols) AS c
    WHERE to_jsonb(o) -> c IS DISTINCT FROM to_jsonb(n) -> c
  )
$$;

CREATE OR REPLACE FUNCTION enforce_invoice_immutability()
RETURNS trigger LANGUAGE plpgsql AS $$
-- To allow a new kind of change, add one branch here built from
-- invoice_document_columns(); do not re-paste column lists (TASK-251).
DECLARE
  doc constant text[] := invoice_document_columns();
BEGIN
  -- Customer views on an open invoice (157).
  IF old.status IN ('sent', 'partial', 'overdue')
     AND NOT invoice_changed(old, new, doc || ARRAY[
       'status', 'client_id', 'job_id', 'estimate_id', 'property_id', 'invoice_kind',
       'paid_cents', 'deposit_cents', 'deposit_type', 'deposit_percentage',
       'deposit_fixed_cents', 'deposit_paid_at', 'square_order_id', 'square_checkout_id',
       'square_payment_link_url', 'due_date', 'sent_at', 'paid_at', 'share_token', 'updated_at'])
     AND invoice_changed(old, new, ARRAY['first_viewed_at', 'last_viewed_at', 'view_count'])
  THEN
    RETURN new;
  END IF;

  -- Re-send of a reopened invoice that already holds payments (192).
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

  -- Reopen to draft: status only; payments stay (112, 192).
  IF old.status IN ('sent', 'partial', 'overdue') AND new.status = 'draft' AND new.paid_cents = old.paid_cents THEN
    IF invoice_changed(old, new, doc || ARRAY['client_id', 'job_id', 'estimate_id', 'property_id', 'due_date']) THEN
      RAISE EXCEPTION
        'invoice reopen to draft may only change status and sent_at'
        USING errcode = 'P0001';
    END IF;
    new.sent_at := NULL;
    RETURN new;
  END IF;

  -- Document link: correct the client, job or property of any non-void invoice (146).
  IF old.status != 'void'
     AND NOT invoice_changed(old, new, doc || ARRAY[
       'status', 'paid_cents', 'deposit_cents', 'due_date', 'sent_at', 'paid_at', 'estimate_id'])
     AND invoice_changed(old, new, ARRAY['client_id', 'job_id', 'property_id'])
  THEN
    RETURN new;
  END IF;

  -- Open invoice: money moves by payment; due date may be filled once (149).
  IF old.status IN ('sent', 'partial', 'overdue') THEN
    IF invoice_changed(old, new, doc || ARRAY['client_id', 'job_id', 'estimate_id', 'property_id', 'sent_at'])
       OR (new.due_date IS DISTINCT FROM old.due_date AND NOT (old.due_date IS NULL AND new.due_date IS NOT NULL))
    THEN
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

-- ── Reversal ────────────────────────────────────────────────────────────────
-- Re-run the enforce_invoice_immutability body from 194, then:
--   DROP FUNCTION IF EXISTS invoice_changed(invoices, invoices, text[]);
--   DROP FUNCTION IF EXISTS invoice_document_columns();
-- No data changes.
