-- Payment terms: due upon completion.
-- Allow a one-time fill of due_date when it was never set on a sent invoice
-- (auto-final path used to omit due_date). Once set, due_date stays immutable.

create or replace function enforce_invoice_immutability()
returns trigger language plpgsql as $$
begin
  -- entering sent: auto-set sent_at
  if new.status = 'sent' and old.status = 'draft' then
    new.sent_at := coalesce(new.sent_at, now());
  end if;

  -- entering paid: auto-set paid_at
  if new.status = 'paid' and old.status != 'paid' then
    new.paid_at := coalesce(new.paid_at, now());
  end if;

  -- in sent / partial / overdue: only paid_cents + status may change,
  -- plus a one-time due_date fill when old.due_date is null.
  if old.status in ('sent', 'partial', 'overdue') then
    if (
      new.client_id        is distinct from old.client_id        or
      new.job_id           is distinct from old.job_id           or
      new.estimate_id      is distinct from old.estimate_id      or
      new.property_id      is distinct from old.property_id      or
      new.invoice_number   is distinct from old.invoice_number   or
      new.subtotal_cents   is distinct from old.subtotal_cents   or
      new.tax_cents        is distinct from old.tax_cents        or
      new.total_cents      is distinct from old.total_cents      or
      new.notes            is distinct from old.notes            or
      (
        new.due_date is distinct from old.due_date
        and not (old.due_date is null and new.due_date is not null)
      ) or
      new.sent_at          is distinct from old.sent_at          or
      new.created_by       is distinct from old.created_by
    ) then
      raise exception
        'invoice in % state: only paid_cents, status, and one-time due_date fill may be updated', old.status
        using errcode = 'P0001';
    end if;
  end if;

  -- terminal states: fully immutable
  if old.status in ('paid', 'void') then
    raise exception
      'invoice in % state is immutable', old.status
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- Backfill open invoices that never got a due date: due upon completion
-- (prefer sent_at calendar day, else created_at).
UPDATE invoices
SET due_date = date_trunc('day', coalesce(sent_at, created_at) AT TIME ZONE 'America/New_York')
              AT TIME ZONE 'America/New_York',
    updated_at = now()
WHERE due_date IS NULL
  AND status IN ('draft', 'sent', 'partial', 'overdue');
