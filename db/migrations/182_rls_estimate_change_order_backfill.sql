-- =============================================================================
-- 182_rls_estimate_change_order_backfill.sql — RLS backfill part 1 (TASK-146)
--
-- Backfills Row-Level Security on the authenticated estimate / change-order
-- write-path tables that were created after 003_rls_policies.sql and never got
-- account isolation. Mirrors the patterns in 003 exactly:
--   - direct account_id tables  → account_id = app_account_id()
--   - child tables (no account_id) → EXISTS-join to the RLS-protected parent
--
-- Scope (deliberately narrow — see the RLS burn-down guard,
-- scripts/check-rls-coverage.mjs, for the remaining grandfathered tables):
--   change_orders, change_order_line_items, estimate_options,
--   estimate_scope_snapshots.
--
-- Intentionally EXCLUDED for now (need separate handling, still grandfathered):
--   booking_requests, intake_invites, maintenance_plans, portal_* — read/written
--     by SESSIONLESS public endpoints that set no app.current_account_id;
--   attention_events — pruned/written by the worker (cross-account cron);
--   price_book*, production_rate*, scope_templates/components, complexity_factors,
--     profitability_rules, trades — global pricing/reference config (no account_id),
--     pending a per-account vs shared product decision;
--   plan_templates / plan_addons / subscription_addons /
--     membership_pricing_structures — subscription domain tied to maintenance_plans.
--
-- Runtime impact today: NONE. The app connects as the Postgres superuser, which
-- bypasses RLS (incl. FORCE). This takes effect only once the restricted
-- ai_fsm_web/ai_fsm_worker runtime role (db-provision-runtime.sh) is switched on.
-- Additive and reversible: drop the policies + `disable row level security`.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- change_orders (direct account_id; estimate-adjacent → owner/admin write)
-- ---------------------------------------------------------------------------

alter table change_orders enable row level security;
alter table change_orders force  row level security;

create policy change_orders_select on change_orders
  for select
  using (account_id = app_account_id());

-- Insert matches POST /api/v1/change-orders (owner/admin/tech). Updates stay
-- owner/admin, matching PATCH /api/v1/change-orders/[id].
create policy change_orders_insert on change_orders
  for insert
  with check (account_id = app_account_id());

create policy change_orders_update on change_orders
  for update
  using (account_id = app_account_id() and is_owner_or_admin());

create policy change_orders_delete on change_orders
  for delete
  using (account_id = app_account_id() and is_owner_or_admin());

-- ---------------------------------------------------------------------------
-- change_order_line_items (no direct account_id — join to parent change_order)
-- ---------------------------------------------------------------------------

alter table change_order_line_items enable row level security;
alter table change_order_line_items force  row level security;

create policy change_order_line_items_select on change_order_line_items
  for select
  using (
    exists (
      select 1 from change_orders co
      where co.id = change_order_id
        and co.account_id = app_account_id()
    )
  );

create policy change_order_line_items_insert on change_order_line_items
  for insert
  with check (
    exists (
      select 1 from change_orders co
      where co.id = change_order_id
        and co.account_id = app_account_id()
    )
  );

create policy change_order_line_items_update on change_order_line_items
  for update
  using (
    is_owner_or_admin()
    and exists (
      select 1 from change_orders co
      where co.id = change_order_id
        and co.account_id = app_account_id()
    )
  );

create policy change_order_line_items_delete on change_order_line_items
  for delete
  using (
    is_owner_or_admin()
    and exists (
      select 1 from change_orders co
      where co.id = change_order_id
        and co.account_id = app_account_id()
    )
  );

-- ---------------------------------------------------------------------------
-- estimate_options (no direct account_id — join to parent estimate)
-- ---------------------------------------------------------------------------

alter table estimate_options enable row level security;
alter table estimate_options force  row level security;

create policy estimate_options_select on estimate_options
  for select
  using (
    exists (
      select 1 from estimates e
      where e.id = estimate_id
        and e.account_id = app_account_id()
    )
  );

create policy estimate_options_insert on estimate_options
  for insert
  with check (
    is_owner_or_admin()
    and exists (
      select 1 from estimates e
      where e.id = estimate_id
        and e.account_id = app_account_id()
    )
  );

create policy estimate_options_update on estimate_options
  for update
  using (
    is_owner_or_admin()
    and exists (
      select 1 from estimates e
      where e.id = estimate_id
        and e.account_id = app_account_id()
    )
  );

create policy estimate_options_delete on estimate_options
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
-- estimate_scope_snapshots (no direct account_id — join through
-- estimate_line_items to the owning estimate)
-- ---------------------------------------------------------------------------

alter table estimate_scope_snapshots enable row level security;
alter table estimate_scope_snapshots force  row level security;

create policy estimate_scope_snapshots_select on estimate_scope_snapshots
  for select
  using (
    exists (
      select 1 from estimate_line_items eli
      join estimates e on e.id = eli.estimate_id
      where eli.id = estimate_line_item_id
        and e.account_id = app_account_id()
    )
  );

create policy estimate_scope_snapshots_insert on estimate_scope_snapshots
  for insert
  with check (
    is_owner_or_admin()
    and exists (
      select 1 from estimate_line_items eli
      join estimates e on e.id = eli.estimate_id
      where eli.id = estimate_line_item_id
        and e.account_id = app_account_id()
    )
  );

create policy estimate_scope_snapshots_update on estimate_scope_snapshots
  for update
  using (
    is_owner_or_admin()
    and exists (
      select 1 from estimate_line_items eli
      join estimates e on e.id = eli.estimate_id
      where eli.id = estimate_line_item_id
        and e.account_id = app_account_id()
    )
  );

create policy estimate_scope_snapshots_delete on estimate_scope_snapshots
  for delete
  using (
    is_owner_or_admin()
    and exists (
      select 1 from estimate_line_items eli
      join estimates e on e.id = eli.estimate_id
      where eli.id = estimate_line_item_id
        and e.account_id = app_account_id()
    )
  );
