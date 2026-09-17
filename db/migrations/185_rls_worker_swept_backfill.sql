-- =============================================================================
-- 185_rls_worker_swept_backfill.sql — RLS backfill, part 4, FINAL (TASK-146)
--
-- booking_requests and attention_events — the last two tables. They were held
-- back because the WORKER sweeps them cross-account (closeStaleBookingRequests,
-- pruneAttentionEvents, vehicle-maintenance-reminder). Investigation showed that
-- is not a two-sweep problem: NO worker job sets account context, and most
-- (estimate-followup, invoice-followup, visit-reminder, review-request, …)
-- already query estimates/invoices/visits — RLS-protected since 003 — across
-- accounts. The worker is a TRUSTED cross-tenant batch processor.
--
-- Correct model (not a per-sweep refactor):
--   - Web tier  → restricted ai_fsm_web (NOBYPASSRLS), per-request account
--     context. RLS enforced. This is where multi-tenant isolation matters.
--   - Worker    → trusted, runs across all accounts → bypasses RLS by design
--     (superuser today, or a BYPASSRLS ai_fsm_worker role). No context needed.
--
-- So these two get NORMAL account-scoped policies (mirror estimates) for the web
-- tier. Every web path that writes them sets context:
--   - authenticated v1 routes via withDbSession;
--   - the public booking form (api/booking) and intake consume (api/intake/[token])
--     set_config the resolved account in-transaction (paired route changes).
-- The worker's cross-account sweeps rely on its privileged connection.
--
-- Runtime impact today: NONE (superuser bypasses RLS). Additive and reversible.
-- =============================================================================

alter table booking_requests  enable row level security;
alter table booking_requests  force  row level security;
alter table attention_events  enable row level security;
alter table attention_events  force  row level security;

-- ── booking_requests (account read, owner/admin write; mirror estimates) ──────

create policy booking_requests_select on booking_requests
  for select using (account_id = app_account_id());

create policy booking_requests_insert on booking_requests
  for insert with check (account_id = app_account_id() and is_owner_or_admin());

create policy booking_requests_update on booking_requests
  for update using (account_id = app_account_id() and is_owner_or_admin());

create policy booking_requests_delete on booking_requests
  for delete using (account_id = app_account_id() and is_owner_or_admin());

-- ── attention_events (account-scoped read; permissive insert) ─────────────────
-- SELECT is account-scoped (a user only sees their own account's events — the
-- isolation that matters for this telemetry). INSERT is permissive: events are
-- written from context-less paths — the worker (cross-account) and portal
-- first-open pages (`emitAttentionEvent` on a raw pooled client, pre-context) —
-- which would otherwise be silently rejected and drop notifications. The writer
-- always supplies account_id explicitly; these rows are low-sensitivity.

create policy attention_events_select on attention_events
  for select using (account_id = app_account_id());

create policy attention_events_insert on attention_events
  for insert with check (true);

create policy attention_events_update on attention_events
  for update using (account_id = app_account_id() and is_owner_or_admin());

create policy attention_events_delete on attention_events
  for delete using (account_id = app_account_id() and is_owner_or_admin());
