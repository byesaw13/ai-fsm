-- =============================================================================
-- 007_expenses.sql — Expense ledger
-- P8-T1 | product-engineer | 2026-03-02
--
-- Adds a first-class self-hosted expense ledger.
-- Categories are locked (CHECK constraint) to prevent freeform sprawl.
-- RLS follows the same account-scoped + role-based pattern as 003_rls_policies.
-- =============================================================================

-- === expenses table ===

create table if not exists expenses (
  id           uuid        primary key default gen_random_uuid(),
  account_id   uuid        not null references accounts(id) on delete cascade,
  job_id       uuid        references jobs(id) on delete set null,
  client_id    uuid        references clients(id) on delete set null,
  property_id  uuid        references properties(id) on delete set null,
  vendor_name  text        not null,
  category     text        not null check (category in (
                             'materials','tools','fuel','vehicle',
                             'subcontractors','office','insurance',
                             'utilities','marketing','meals','travel','other'
                           )),
  amount_cents int         not null check (amount_cents > 0),
  expense_date date        not null,
  notes        text,
  receipt_url  text,
  created_by   uuid        not null references users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger trg_expenses_updated_at before update on expenses
  for each row execute function update_updated_at_column();

-- === indexes ===

create index if not exists idx_expenses_account       on expenses(account_id);
create index if not exists idx_expenses_account_date  on expenses(account_id, expense_date);
create index if not exists idx_expenses_category      on expenses(account_id, category);
create index if not exists idx_expenses_job           on expenses(job_id);
create index if not exists idx_expenses_client        on expenses(client_id);

-- === RLS ===

alter table expenses enable row level security;
alter table expenses force row level security;

-- All account members can read their own expenses
create policy expenses_select on expenses
  for select using (account_id = app_account_id());

-- Owner and admin can insert
create policy expenses_insert on expenses
  for insert with check (account_id = app_account_id() and is_owner_or_admin());

-- Owner and admin can update
create policy expenses_update on expenses
  for update using (account_id = app_account_id() and is_owner_or_admin());

-- Owner only can delete
create policy expenses_delete on expenses
  for delete using (account_id = app_account_id() and app_role() = 'owner');
