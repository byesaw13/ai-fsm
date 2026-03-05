-- =============================================================================
-- 008_mileage_logs.sql — Mileage logs
-- P8 hotfix | 2026-03-05
--
-- Adds mileage_logs used by profitability/reporting endpoints.
-- Idempotent guards are included for trigger/policy creation to handle
-- environments that may have partially applied objects.
-- =============================================================================

create table if not exists mileage_logs (
  id           uuid        primary key default gen_random_uuid(),
  account_id   uuid        not null references accounts(id) on delete cascade,
  job_id       uuid        references jobs(id) on delete set null,
  trip_date    date        not null,
  miles        numeric(10,2) not null check (miles > 0),
  purpose      text        not null,
  notes        text,
  created_by   uuid        not null references users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_mileage_logs_updated_at'
      and tgrelid = 'mileage_logs'::regclass
  ) then
    create trigger trg_mileage_logs_updated_at
      before update on mileage_logs
      for each row execute function update_updated_at_column();
  end if;
end $$;

create index if not exists idx_mileage_logs_account on mileage_logs(account_id);
create index if not exists idx_mileage_logs_account_trip_date on mileage_logs(account_id, trip_date);
create index if not exists idx_mileage_logs_job on mileage_logs(job_id);
create index if not exists idx_mileage_logs_created_by on mileage_logs(created_by);

alter table mileage_logs enable row level security;
alter table mileage_logs force row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'mileage_logs'
      and policyname = 'mileage_logs_select'
  ) then
    create policy mileage_logs_select on mileage_logs
      for select using (account_id = app_account_id());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'mileage_logs'
      and policyname = 'mileage_logs_insert'
  ) then
    create policy mileage_logs_insert on mileage_logs
      for insert with check (account_id = app_account_id() and is_account_member());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'mileage_logs'
      and policyname = 'mileage_logs_update'
  ) then
    create policy mileage_logs_update on mileage_logs
      for update using (account_id = app_account_id() and is_account_member());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'mileage_logs'
      and policyname = 'mileage_logs_delete'
  ) then
    create policy mileage_logs_delete on mileage_logs
      for delete using (account_id = app_account_id() and is_owner_or_admin());
  end if;
end $$;
