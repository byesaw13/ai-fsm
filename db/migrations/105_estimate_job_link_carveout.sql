-- 105_estimate_job_link_carveout.sql
-- Allow a one-time job link on an already-approved estimate.
--
-- Problem (see ESTIMATE_SYSTEM_DEEP_AUDIT.md): an approved estimate can exist
-- with no linked job, and the workflow Estimate → Job → Visit then dead-ends —
-- the approved scope can never be scheduled. The fix is a "Create Linked Job"
-- action, but estimate immutability blocks ANY update to a terminal estimate,
-- including setting estimates.job_id.
--
-- This narrows the immutability rule: on a terminal estimate, permit job_id to
-- transition from NULL to a value when nothing else changes. This is a
-- structural completion of the canonical workflow, not a mutation of the
-- estimate's priced content. Re-linking (changing a non-NULL job_id) stays
-- forbidden, as does every other field.
--
-- Idempotent: CREATE OR REPLACE FUNCTION.

CREATE OR REPLACE FUNCTION public.enforce_estimate_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
begin
  -- entering sent: auto-set sent_at
  if new.status = 'sent' and old.status = 'draft' then
    new.sent_at := coalesce(new.sent_at, now());
  end if;

  -- in sent state: only internal_notes may change
  if old.status = 'sent' then
    if (
      new.client_id        is distinct from old.client_id        or
      new.job_id           is distinct from old.job_id           or
      new.property_id      is distinct from old.property_id      or
      new.subtotal_cents   is distinct from old.subtotal_cents   or
      new.tax_cents        is distinct from old.tax_cents        or
      new.total_cents      is distinct from old.total_cents      or
      new.notes            is distinct from old.notes            or
      new.expires_at       is distinct from old.expires_at       or
      new.sent_at          is distinct from old.sent_at          or
      new.created_by       is distinct from old.created_by
    ) then
      raise exception
        'estimate in sent state: only internal_notes may be updated'
        using errcode = 'P0001';
    end if;
  end if;

  -- terminal states: fully immutable EXCEPT a one-time NULL→value job link.
  if old.status in ('approved', 'declined', 'expired') then
    if (
      old.job_id is null
      and new.job_id is not null
      and new.status        is not distinct from old.status
      and new.client_id     is not distinct from old.client_id
      and new.property_id   is not distinct from old.property_id
      and new.subtotal_cents is not distinct from old.subtotal_cents
      and new.tax_cents     is not distinct from old.tax_cents
      and new.total_cents   is not distinct from old.total_cents
      and new.deposit_cents is not distinct from old.deposit_cents
      and new.notes         is not distinct from old.notes
    ) then
      return new; -- permit the one-time job link
    end if;

    raise exception
      'estimate in % state is immutable', old.status
      using errcode = 'P0001';
  end if;

  return new;
end;
$function$;
