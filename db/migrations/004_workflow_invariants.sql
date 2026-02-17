-- =============================================================================
-- 004_workflow_invariants.sql — Workflow transition guards and immutability
-- P1-T2 | agent-b | 2026-02-17
--
-- Source evidence:
--   Myprogram: supabase/migrations/003_workflow_invariants.sql
--              (transition validation functions, immutability trigger pattern,
--               auto-set timestamp pattern on status change)
--   Dovelite: db/001_initial_schema.sql
--              (visit status CHECK constraints, arrived_at/completed_at auto-set)
--
-- Enforces (at DB layer, independent of app layer):
--   1. Job status transitions per workflow-states.md
--   2. Visit status transitions + auto-set arrived_at / completed_at
--      + requires assigned_user_id before arrived transition
--   3. Estimate immutability (only draft allows full edits)
--   4. Invoice immutability (only draft allows full edits)
--   5. Payment auto-update invoice paid_cents + status transition
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Job transition guard
-- ---------------------------------------------------------------------------

create or replace function validate_job_transition()
returns trigger language plpgsql as $$
declare
  allowed text[];
begin
  -- no-op if status unchanged
  if new.status = old.status then
    return new;
  end if;

  -- allowed transition table (from workflow-states.md)
  allowed := case old.status
    when 'draft'       then array['quoted', 'scheduled']
    when 'quoted'      then array['scheduled', 'draft']
    when 'scheduled'   then array['in_progress', 'cancelled']
    when 'in_progress' then array['completed', 'cancelled']
    when 'completed'   then array['invoiced']
    when 'invoiced'    then array[]::text[]   -- terminal
    when 'cancelled'   then array['draft']
    else                    array[]::text[]
  end;

  if not (new.status = any(allowed)) then
    raise exception
      'invalid job transition: % → % (allowed: %)',
      old.status, new.status, array_to_string(allowed, ', ')
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger trg_jobs_transition
  before update on jobs
  for each row execute function validate_job_transition();

-- ---------------------------------------------------------------------------
-- 2. Visit transition guard + auto-set arrived_at / completed_at
-- ---------------------------------------------------------------------------

create or replace function validate_visit_transition()
returns trigger language plpgsql as $$
declare
  allowed text[];
begin
  if new.status = old.status then
    return new;
  end if;

  -- require assigned tech before arriving
  if new.status = 'arrived' and new.assigned_user_id is null then
    raise exception
      'visit cannot transition to arrived without an assigned user'
      using errcode = 'P0001';
  end if;

  allowed := case old.status
    when 'scheduled'   then array['arrived', 'cancelled']
    when 'arrived'     then array['in_progress', 'cancelled']
    when 'in_progress' then array['completed']
    when 'completed'   then array[]::text[]   -- terminal
    when 'cancelled'   then array[]::text[]   -- terminal
    else                    array[]::text[]
  end;

  if not (new.status = any(allowed)) then
    raise exception
      'invalid visit transition: % → % (allowed: %)',
      old.status, new.status, array_to_string(allowed, ', ')
      using errcode = 'P0001';
  end if;

  -- auto-set timestamps on transition
  if new.status = 'arrived' and old.status != 'arrived' then
    new.arrived_at := now();
  end if;

  if new.status = 'completed' and old.status != 'completed' then
    new.completed_at := now();
  end if;

  return new;
end;
$$;

create trigger trg_visits_transition
  before update on visits
  for each row execute function validate_visit_transition();

-- ---------------------------------------------------------------------------
-- 3. Estimate immutability
-- draft     → all fields editable
-- sent      → only internal_notes editable; sent_at auto-set
-- approved / declined / expired → fully immutable
-- ---------------------------------------------------------------------------

create or replace function enforce_estimate_immutability()
returns trigger language plpgsql as $$
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

  -- terminal states: fully immutable (only status transitions allowed from worker)
  if old.status in ('approved', 'declined', 'expired') then
    raise exception
      'estimate in % state is immutable', old.status
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger trg_estimates_immutability
  before update on estimates
  for each row execute function enforce_estimate_immutability();

-- ---------------------------------------------------------------------------
-- 4. Invoice immutability
-- draft   → all fields editable
-- sent    → only paid_cents updatable; sent_at auto-set
-- partial / overdue → only paid_cents updatable (via payment recording)
-- paid / void → fully immutable
-- ---------------------------------------------------------------------------

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

  -- in sent / partial / overdue: only paid_cents + status may change
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
      new.due_date         is distinct from old.due_date         or
      new.sent_at          is distinct from old.sent_at          or
      new.created_by       is distinct from old.created_by
    ) then
      raise exception
        'invoice in % state: only paid_cents and status may be updated', old.status
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

create trigger trg_invoices_immutability
  before update on invoices
  for each row execute function enforce_invoice_immutability();

-- ---------------------------------------------------------------------------
-- 5. Payment recording → auto-update invoice paid_cents and status
-- When a payment is inserted, update the linked invoice's paid_cents and
-- derive status: paid / partial based on total_cents comparison.
-- ---------------------------------------------------------------------------

create or replace function sync_invoice_on_payment()
returns trigger language plpgsql security definer
  set search_path = public
as $$
declare
  inv         invoices%rowtype;
  new_paid    integer;
  new_status  text;
begin
  select * into inv from invoices where id = new.invoice_id for update;

  if not found then
    raise exception 'invoice % not found', new.invoice_id;
  end if;

  -- sum all payments for this invoice
  select coalesce(sum(amount_cents), 0) into new_paid
  from payments
  where invoice_id = new.invoice_id;

  -- derive new status
  new_status := case
    when new_paid >= inv.total_cents then 'paid'
    when new_paid > 0               then 'partial'
    else inv.status   -- no change (e.g. total_cents is 0)
  end;

  -- bypass immutability trigger: update paid_cents + status directly
  -- (this function runs with security definer to bypass RLS + trigger check
  --  because this is an authorised internal state machine update)
  update invoices
  set
    paid_cents = new_paid,
    status     = new_status,
    paid_at    = case when new_status = 'paid' then now() else paid_at end
  where id = new.invoice_id;

  return new;
end;
$$;

create trigger trg_payment_sync_invoice
  after insert on payments
  for each row execute function sync_invoice_on_payment();

-- ---------------------------------------------------------------------------
-- 6. Estimate transition guard (separate from immutability — catches status
--    changes that don't match the allowed transition table)
-- ---------------------------------------------------------------------------

create or replace function validate_estimate_transition()
returns trigger language plpgsql as $$
declare
  allowed text[];
begin
  if new.status = old.status then
    return new;
  end if;

  allowed := case old.status
    when 'draft'    then array['sent']
    when 'sent'     then array['approved', 'declined', 'expired']
    when 'approved' then array[]::text[]
    when 'declined' then array[]::text[]
    when 'expired'  then array[]::text[]
    else                 array[]::text[]
  end;

  if not (new.status = any(allowed)) then
    raise exception
      'invalid estimate transition: % → % (allowed: %)',
      old.status, new.status, array_to_string(allowed, ', ')
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- Note: trg_estimates_immutability fires BEFORE this for state-specific field
-- checks. Order matters — both are BEFORE UPDATE triggers; Postgres fires them
-- in name order alphabetically, so immutability fires before transition guard.
-- The immutability trigger blocks all field changes in terminal states, so the
-- transition guard below only matters for the draft→sent and sent→* paths.
create trigger trg_estimates_transition
  before update on estimates
  for each row execute function validate_estimate_transition();

-- ---------------------------------------------------------------------------
-- 7. Invoice transition guard
-- ---------------------------------------------------------------------------

create or replace function validate_invoice_transition()
returns trigger language plpgsql as $$
declare
  allowed text[];
begin
  if new.status = old.status then
    return new;
  end if;

  allowed := case old.status
    when 'draft'   then array['sent', 'void']
    when 'sent'    then array['partial', 'paid', 'overdue', 'void']
    when 'partial' then array['paid', 'overdue', 'void']
    when 'overdue' then array['partial', 'paid', 'void']
    when 'paid'    then array[]::text[]
    when 'void'    then array[]::text[]
    else                array[]::text[]
  end;

  if not (new.status = any(allowed)) then
    raise exception
      'invalid invoice transition: % → % (allowed: %)',
      old.status, new.status, array_to_string(allowed, ', ')
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger trg_invoices_transition
  before update on invoices
  for each row execute function validate_invoice_transition();
