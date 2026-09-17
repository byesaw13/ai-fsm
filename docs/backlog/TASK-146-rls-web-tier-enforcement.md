# TASK-146: RLS enforcement on the web tier

**Epic:** 005 (Platform & Delivery)
**Status:** In Progress

## Problem

Row-Level Security exists (`003_rls_policies.sql` + later tables) but is **inert
in production**: the app connects as the Postgres superuser, which bypasses RLS.
Tenant isolation rests entirely on app-layer `WHERE account_id = …` clauses.
(Supersedes the intent of the cancelled TASK-034, which was MCP-scoped.)

## Goal

Run the **web tier** as the restricted, `NOBYPASSRLS` `ai_fsm_web` role
(provisioned by `scripts/db-provision-runtime.sh`, PR #643) so isolation is
enforced by the database. The **worker** stays privileged (trusted cross-tenant
batch processor — it bypasses RLS by design).

## Scope

- [x] Backfill account-scoped RLS on every remaining account-scoped table
      (migrations 182–185), shaped to each table's real access.
- [x] `scripts/check-rls-coverage.{mjs,test.mjs}` burn-down guard, wired into
      `gate.sh`; requires both RLS **and** a policy per enabled table.
- [x] `set_config` tenant context in the sessionless booking/intake write paths.
- [x] `docs/working/rls-web-tier-flip.md` — the cutover runbook.

## Blockers before the cutover (must land first)

- [ ] **Portal read-bootstrap.** Pre-auth portal paths
      (`api/v1/portal/request-access`, portal client/estimate/invoice pages) read
      `clients`/`estimates`/`invoices` — RLS-protected — *before* any account
      context, so under `ai_fsm_web` they return nothing (magic link silently not
      sent). Add a bounded `SECURITY DEFINER` resolver (like `app_login_candidates`
      for auth login) that maps a portal token/email → account, and set context
      from it. (Codex P1 on PR #651.)
- [ ] **Square webhook bootstrap.** `api/webhooks/square` looks up
      `integration_settings` by location with no context; under `ai_fsm_web` it
      acks and drops completed payments. Bounded `locationId → account` lookup +
      `set_config` before the rest of the handler.
- [ ] **Public estimate respond.** `api/v1/estimates/[id]/respond` updates
      `estimates` from a signed token before context; RLS makes approve/decline
      look successful while the row stays `sent`. Set context from the token
      before the UPDATE.
- [ ] **Verify every authenticated read/write path sets context** end to end
      under the restricted role (the flip runbook's verification checklist).
      Include remaining sessionless/token/internal entry points, not only
      portal + booking + intake.

## Non-goals

- Flipping the runtime role in this task's first PR (that is the cutover, gated
  on the blockers above).
- A restricted worker role (needs `BYPASSRLS`; out of scope).
