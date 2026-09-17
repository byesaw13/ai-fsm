-- =============================================================================
-- 183_rls_subscription_portal_backfill.sql — RLS backfill, part 2 (TASK-146)
--
-- account_id-bearing tables. Two shapes, both mirroring 003_rls_policies.sql:
--
--   STRICT account-scoped (real DB isolation) — authenticated-only tables:
--     plan_templates, plan_addons, subscription_addons,
--     membership_pricing_structures.
--
--   Permissive SELECT + account-scoped writes — tables whose FIRST read is a
--   pre-auth / by-token lookup that happens BEFORE any account context exists
--   (you resolve the account FROM the row), so an account-scoped SELECT would
--   make that lookup impossible. The unguessable token + the app's WHERE clause
--   are the read boundary; writes still carry account context:
--     intake_invites    (consumed by token at /api/intake/[token])
--     maintenance_plans (read by client token at /api/portal/clients/[token])
--
-- Writers set app.current_account_id: authenticated v1 routes via withDbSession;
-- the sessionless booking/intake routes get a set_config in the same commit
-- (see the paired route changes).
--
-- NOT here — booking_requests and attention_events — they are swept
-- CROSS-ACCOUNT by the worker (closeStaleBookingRequests, pruneAttentionEvents)
-- with no per-account context; account-scoping them needs a worker-role decision
-- (per-account loop vs admin connection). Left grandfathered on purpose.
--
-- The `enable/force row level security` lines are written explicitly (not via a
-- DO-loop) so scripts/check-rls-coverage.mjs can see them statically.
--
-- Runtime impact today: NONE (app connects as superuser, bypasses RLS). Additive
-- and reversible.
-- =============================================================================

alter table plan_templates                enable row level security;
alter table plan_templates                force  row level security;
alter table plan_addons                   enable row level security;
alter table plan_addons                   force  row level security;
alter table subscription_addons           enable row level security;
alter table subscription_addons           force  row level security;
alter table membership_pricing_structures enable row level security;
alter table membership_pricing_structures force  row level security;

alter table intake_invites                enable row level security;
alter table intake_invites                force  row level security;
alter table maintenance_plans             enable row level security;
alter table maintenance_plans             force  row level security;

-- ── STRICT account-scoped (mirror estimates: account read, owner/admin write) ──
do $$
declare t text;
begin
  foreach t in array array['plan_templates','plan_addons','subscription_addons','membership_pricing_structures']
  loop
    execute format($f$create policy %1$s_select on %1$I for select
        using (account_id = app_account_id())$f$, t);
    execute format($f$create policy %1$s_insert on %1$I for insert
        with check (account_id = app_account_id() and is_owner_or_admin())$f$, t);
    execute format($f$create policy %1$s_update on %1$I for update
        using (account_id = app_account_id() and is_owner_or_admin())$f$, t);
    execute format($f$create policy %1$s_delete on %1$I for delete
        using (account_id = app_account_id() and is_owner_or_admin())$f$, t);
  end loop;
end $$;

-- ── Permissive SELECT + account-scoped writes (pre-auth / by-token reads) ──────
do $$
declare t text;
begin
  foreach t in array array['intake_invites','maintenance_plans']
  loop
    -- SELECT permissive: read boundary is the unguessable token in app WHERE.
    execute format($f$create policy %1$s_select on %1$I for select using (true)$f$, t);
    execute format($f$create policy %1$s_insert on %1$I for insert
        with check (account_id = app_account_id())$f$, t);
    execute format($f$create policy %1$s_update on %1$I for update
        using (account_id = app_account_id())$f$, t);
    execute format($f$create policy %1$s_delete on %1$I for delete
        using (account_id = app_account_id())$f$, t);
  end loop;
end $$;
