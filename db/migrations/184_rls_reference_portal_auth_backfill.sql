-- =============================================================================
-- 184_rls_reference_portal_auth_backfill.sql — RLS backfill, part 3 (TASK-146)
--
-- Tables with NO account_id column. Enabling RLS is still required so the
-- restricted ai_fsm_web/ai_fsm_worker role gets a GRANT (the provisioner only
-- grants on relrowsecurity tables) — the policy shape reflects the real model:
--
--   PRE-AUTH TOKEN tables — accessed before any session exists, keyed only by an
--   unguessable token + expiry checked in the app WHERE clause. There is no
--   account to scope to at read time, so both read and write are permissive:
--     portal_magic_links, portal_sessions
--
--   GLOBAL REFERENCE / PRICING CONFIG — shared, account-agnostic business data
--   (there is no account_id). Any authenticated caller may read; only owner/admin
--   may write. If Dovetails ever goes multi-tenant these need an account_id
--   column + account-scoped policies (a data migration, out of scope here):
--     price_book, price_book_modifiers, production_rates, production_rate_modifiers,
--     complexity_factors, scope_templates, scope_components, profitability_rules,
--     service_materials, trades
--
-- The `enable/force row level security` lines are explicit (not a DO-loop) so
-- scripts/check-rls-coverage.mjs sees them statically.
--
-- Runtime impact today: NONE (superuser bypasses RLS). Additive and reversible.
-- =============================================================================

alter table portal_magic_links        enable row level security;
alter table portal_magic_links        force  row level security;
alter table portal_sessions           enable row level security;
alter table portal_sessions           force  row level security;

alter table price_book                enable row level security;
alter table price_book                force  row level security;
alter table price_book_modifiers      enable row level security;
alter table price_book_modifiers      force  row level security;
alter table production_rates          enable row level security;
alter table production_rates          force  row level security;
alter table production_rate_modifiers enable row level security;
alter table production_rate_modifiers force  row level security;
alter table complexity_factors        enable row level security;
alter table complexity_factors        force  row level security;
alter table scope_templates           enable row level security;
alter table scope_templates           force  row level security;
alter table scope_components          enable row level security;
alter table scope_components          force  row level security;
alter table profitability_rules       enable row level security;
alter table profitability_rules       force  row level security;
alter table service_materials         enable row level security;
alter table service_materials         force  row level security;
alter table trades                    enable row level security;
alter table trades                    force  row level security;

-- ── Pre-auth token tables: permissive (the token is the boundary) ─────────────
do $$
declare t text;
begin
  foreach t in array array['portal_magic_links','portal_sessions']
  loop
    execute format($f$create policy %1$s_all on %1$I
        for all using (true) with check (true)$f$, t);
  end loop;
end $$;

-- ── Global reference/config: any authenticated read, owner/admin write ────────
do $$
declare t text;
begin
  foreach t in array array[
    'price_book','price_book_modifiers','production_rates','production_rate_modifiers',
    'complexity_factors','scope_templates','scope_components','profitability_rules',
    'service_materials','trades'
  ]
  loop
    execute format($f$create policy %1$s_select on %1$I for select using (true)$f$, t);
    execute format($f$create policy %1$s_insert on %1$I for insert
        with check (is_owner_or_admin())$f$, t);
    execute format($f$create policy %1$s_update on %1$I for update
        using (is_owner_or_admin())$f$, t);
    execute format($f$create policy %1$s_delete on %1$I for delete
        using (is_owner_or_admin())$f$, t);
  end loop;
end $$;
