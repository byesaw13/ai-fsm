-- =============================================================================
-- 003_rls_policies.sql — Row-Level Security policies
-- P1-T2 | agent-b | 2026-02-17
--
-- Source evidence:
--   Myprogram: supabase/migrations/002_rls_policies.sql (RBAC policy structure,
--              account-scoped helper functions, security definer pattern)
--   Dovelite: db/002_rls_policies.sql (account-scoped RLS helper pattern,
--              enable_rls + force_rls approach)
--
-- Design:
--   The app layer (Next.js API routes + middleware) sets three PostgreSQL session
--   variables on every connection before executing queries:
--
--     SET LOCAL app.current_user_id    = '<uuid>';
--     SET LOCAL app.current_account_id = '<uuid>';
--     SET LOCAL app.current_role       = 'owner|admin|tech';
--
--   RLS helper functions read these variables. All policies use these helpers so
--   the DB enforces tenant isolation independently of the app layer.
--
--   Role matrix (from workflow-states.md):
--     owner — full access; one per account
--     admin — full operational access; cannot delete account or manage owner
--     tech  — read jobs/visits (account-scoped); update own-assigned visits only;
--             read-only on estimates/invoices; no write on clients/properties
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Session variable helpers
-- ---------------------------------------------------------------------------

create or replace function app_user_id() returns uuid
  language sql stable security definer
  set search_path = public
as $$
  select nullif(current_setting('app.current_user_id', true), '')::uuid;
$$;

create or replace function app_account_id() returns uuid
  language sql stable security definer
  set search_path = public
as $$
  select nullif(current_setting('app.current_account_id', true), '')::uuid;
$$;

create or replace function app_role() returns text
  language sql stable security definer
  set search_path = public
as $$
  select nullif(current_setting('app.current_role', true), '');
$$;

-- Convenience: returns true if caller is owner or admin
create or replace function is_owner_or_admin() returns boolean
  language sql stable security definer
  set search_path = public
as $$
  select app_role() in ('owner', 'admin');
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS + force RLS (so table owners are also restricted)
-- ---------------------------------------------------------------------------

alter table accounts         enable row level security;
alter table accounts         force  row level security;

alter table users            enable row level security;
alter table users            force  row level security;

alter table clients          enable row level security;
alter table clients          force  row level security;

alter table properties       enable row level security;
alter table properties       force  row level security;

alter table jobs             enable row level security;
alter table jobs             force  row level security;

alter table visits           enable row level security;
alter table visits           force  row level security;

alter table estimates        enable row level security;
alter table estimates        force  row level security;

alter table estimate_line_items enable row level security;
alter table estimate_line_items force  row level security;

alter table invoices         enable row level security;
alter table invoices         force  row level security;

alter table invoice_line_items enable row level security;
alter table invoice_line_items force  row level security;

alter table payments         enable row level security;
alter table payments         force  row level security;

alter table automations      enable row level security;
alter table automations      force  row level security;

alter table audit_log        enable row level security;
alter table audit_log        force  row level security;

-- ---------------------------------------------------------------------------
-- accounts
-- Policy: any authenticated user can read their own account row.
-- Only the app (service-role bypass or owner) may update/delete.
-- ---------------------------------------------------------------------------

create policy accounts_select on accounts
  for select
  using (id = app_account_id());

create policy accounts_update on accounts
  for update
  using (id = app_account_id() and app_role() = 'owner');

-- No insert via app — accounts are created by an admin bootstrap script.
-- No delete via app — prevent accidental tenant destruction.

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------

create policy users_select on users
  for select
  using (account_id = app_account_id());

-- owner and admin can create users; inserted user must belong to same account
create policy users_insert on users
  for insert
  with check (account_id = app_account_id() and is_owner_or_admin());

-- owner and admin can update any user; prevent role escalation beyond own role
-- is enforced at the API layer (DB only checks account scope + authorization)
create policy users_update on users
  for update
  using (account_id = app_account_id() and is_owner_or_admin());

-- only owner can delete users
create policy users_delete on users
  for delete
  using (account_id = app_account_id() and app_role() = 'owner');

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------

create policy clients_select on clients
  for select
  using (account_id = app_account_id());

create policy clients_insert on clients
  for insert
  with check (account_id = app_account_id() and is_owner_or_admin());

create policy clients_update on clients
  for update
  using (account_id = app_account_id() and is_owner_or_admin());

create policy clients_delete on clients
  for delete
  using (account_id = app_account_id() and is_owner_or_admin());

-- ---------------------------------------------------------------------------
-- properties
-- ---------------------------------------------------------------------------

create policy properties_select on properties
  for select
  using (account_id = app_account_id());

create policy properties_insert on properties
  for insert
  with check (account_id = app_account_id() and is_owner_or_admin());

create policy properties_update on properties
  for update
  using (account_id = app_account_id() and is_owner_or_admin());

create policy properties_delete on properties
  for delete
  using (account_id = app_account_id() and is_owner_or_admin());

-- ---------------------------------------------------------------------------
-- jobs
-- techs can read all jobs in their account (they need context for their visits)
-- only owner/admin can write
-- ---------------------------------------------------------------------------

create policy jobs_select on jobs
  for select
  using (account_id = app_account_id());

create policy jobs_insert on jobs
  for insert
  with check (account_id = app_account_id() and is_owner_or_admin());

create policy jobs_update on jobs
  for update
  using (account_id = app_account_id() and is_owner_or_admin());

create policy jobs_delete on jobs
  for delete
  using (account_id = app_account_id() and is_owner_or_admin());

-- ---------------------------------------------------------------------------
-- visits
-- techs can read visits assigned to them; owner/admin see all
-- techs can update visits assigned to them (status + tech_notes enforced at API layer)
-- only owner/admin can insert/delete
-- ---------------------------------------------------------------------------

create policy visits_select on visits
  for select
  using (
    account_id = app_account_id()
    and (
      is_owner_or_admin()
      or assigned_user_id = app_user_id()
    )
  );

create policy visits_insert on visits
  for insert
  with check (account_id = app_account_id() and is_owner_or_admin());

create policy visits_update on visits
  for update
  using (
    account_id = app_account_id()
    and (
      is_owner_or_admin()
      or assigned_user_id = app_user_id()
    )
  );

create policy visits_delete on visits
  for delete
  using (account_id = app_account_id() and is_owner_or_admin());

-- ---------------------------------------------------------------------------
-- estimates (read-only for tech)
-- ---------------------------------------------------------------------------

create policy estimates_select on estimates
  for select
  using (account_id = app_account_id());

create policy estimates_insert on estimates
  for insert
  with check (account_id = app_account_id() and is_owner_or_admin());

create policy estimates_update on estimates
  for update
  using (account_id = app_account_id() and is_owner_or_admin());

create policy estimates_delete on estimates
  for delete
  using (account_id = app_account_id() and is_owner_or_admin());

-- ---------------------------------------------------------------------------
-- estimate_line_items (no direct account_id — join to parent estimate)
-- ---------------------------------------------------------------------------

create policy estimate_line_items_select on estimate_line_items
  for select
  using (
    exists (
      select 1 from estimates e
      where e.id = estimate_id
        and e.account_id = app_account_id()
    )
  );

create policy estimate_line_items_insert on estimate_line_items
  for insert
  with check (
    is_owner_or_admin()
    and exists (
      select 1 from estimates e
      where e.id = estimate_id
        and e.account_id = app_account_id()
    )
  );

create policy estimate_line_items_update on estimate_line_items
  for update
  using (
    is_owner_or_admin()
    and exists (
      select 1 from estimates e
      where e.id = estimate_id
        and e.account_id = app_account_id()
    )
  );

create policy estimate_line_items_delete on estimate_line_items
  for delete
  using (
    is_owner_or_admin()
    and exists (
      select 1 from estimates e
      where e.id = estimate_id
        and e.account_id = app_account_id()
    )
  );

-- ---------------------------------------------------------------------------
-- invoices (read-only for tech)
-- ---------------------------------------------------------------------------

create policy invoices_select on invoices
  for select
  using (account_id = app_account_id());

create policy invoices_insert on invoices
  for insert
  with check (account_id = app_account_id() and is_owner_or_admin());

create policy invoices_update on invoices
  for update
  using (account_id = app_account_id() and is_owner_or_admin());

create policy invoices_delete on invoices
  for delete
  using (account_id = app_account_id() and is_owner_or_admin());

-- ---------------------------------------------------------------------------
-- invoice_line_items (no direct account_id — join to parent invoice)
-- ---------------------------------------------------------------------------

create policy invoice_line_items_select on invoice_line_items
  for select
  using (
    exists (
      select 1 from invoices i
      where i.id = invoice_id
        and i.account_id = app_account_id()
    )
  );

create policy invoice_line_items_insert on invoice_line_items
  for insert
  with check (
    is_owner_or_admin()
    and exists (
      select 1 from invoices i
      where i.id = invoice_id
        and i.account_id = app_account_id()
    )
  );

create policy invoice_line_items_update on invoice_line_items
  for update
  using (
    is_owner_or_admin()
    and exists (
      select 1 from invoices i
      where i.id = invoice_id
        and i.account_id = app_account_id()
    )
  );

create policy invoice_line_items_delete on invoice_line_items
  for delete
  using (
    is_owner_or_admin()
    and exists (
      select 1 from invoices i
      where i.id = invoice_id
        and i.account_id = app_account_id()
    )
  );

-- ---------------------------------------------------------------------------
-- payments (read for all authenticated; write for owner/admin only)
-- ---------------------------------------------------------------------------

create policy payments_select on payments
  for select
  using (account_id = app_account_id());

create policy payments_insert on payments
  for insert
  with check (account_id = app_account_id() and is_owner_or_admin());

-- payments are immutable after recording — no update policy
-- delete only by owner (e.g. data correction)
create policy payments_delete on payments
  for delete
  using (account_id = app_account_id() and app_role() = 'owner');

-- ---------------------------------------------------------------------------
-- automations (owner/admin only — techs have no visibility)
-- ---------------------------------------------------------------------------

create policy automations_select on automations
  for select
  using (account_id = app_account_id() and is_owner_or_admin());

create policy automations_insert on automations
  for insert
  with check (account_id = app_account_id() and is_owner_or_admin());

create policy automations_update on automations
  for update
  using (account_id = app_account_id() and is_owner_or_admin());

create policy automations_delete on automations
  for delete
  using (account_id = app_account_id() and app_role() = 'owner');

-- ---------------------------------------------------------------------------
-- audit_log (append-only; owner/admin read; no update or delete)
-- Worker service uses a dedicated DB role that bypasses RLS to write audit rows.
-- ---------------------------------------------------------------------------

create policy audit_log_select on audit_log
  for select
  using (account_id = app_account_id() and is_owner_or_admin());

create policy audit_log_insert on audit_log
  for insert
  with check (account_id = app_account_id());

-- Intentionally no UPDATE or DELETE policies on audit_log.
