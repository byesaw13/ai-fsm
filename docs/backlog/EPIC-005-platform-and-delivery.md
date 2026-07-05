# EPIC-005: Platform & Delivery

How the app is packaged, served, and installed — the delivery surface beneath
the product features. Concerns here are cross-cutting (installability, secure
origin, offline behavior, deployment shape) rather than tied to any one
workflow.

## Active tasks


# TASK-034: MCP Non-Superuser RLS Verification

Status:
Proposed

Phase:
cross-cutting

Problem:
The MCP integration tests (TASK-033) run as a Postgres superuser, which bypasses
RLS. Account isolation is therefore proven only through the tools' explicit
`account_id` predicates, not through RLS policies alone. That is acceptable for
the read-only phase (it matches what production currently relies on), but it
leaves the row-level-security half of the defense-in-depth model unverified.

Business Value:
- Confirms the database enforces tenant isolation even if an application-level
  `account_id` filter is ever dropped from a query by mistake.
- De-risks future write tools (TASK-035), where a scoping bug would be worse.

Scope:
- Add integration coverage that connects as a **non-superuser application role**
  (no `BYPASSRLS`), with the same `app.current_*` session vars the server sets.
- Verify `app_role()` / `app_account_id()` resolve correctly for that role.
- Verify RLS policies **alone** prevent cross-account reads (A cannot see B) with
  the explicit `account_id` predicate deliberately removed in the test query.
- Confirm the MCP surface stays secure under both RLS and app-level filtering.

Out of Scope:
- Changing the production DB role or connection model.
- Any new tools.

Acceptance Criteria:
- [ ] A non-superuser role is provisioned in the integration setup.
- [ ] Cross-account access is blocked by RLS with no explicit `account_id` filter.
- [ ] `app_role()` resolves to the operator's role for that connection.
- [ ] Tests skip gracefully when `TEST_DATABASE_URL` is unset.

Notes:
Tracks the one caveat surfaced when reviewing TASK-033's integration tests.
Originally framed as `MCP-RLS-001`.

# TASK-036: PR Gatekeeper MCP Server

Status:
Deferred

Phase:
cross-cutting

The local PR Gatekeeper MCP experiment was removed in the ponytail cleanup. Use the simpler maintained workflow instead: `gh pr checks`, `gh pr diff`, GitHub branch protection, and the repo gate (`pnpm gate`). Historical implementation details remain available in git history.

# TASK-039: Human-readable numbering for jobs and estimates

Status:
Done

Phase:
cross-cutting

Problem:
Invoices have human-readable per-account numbers (`invoices.invoice_number`,
unique per account), but jobs and estimates do not. There is no stable
`J-2026-####` / `EST-2026-####` identifier to reference a job or estimate in
conversation, on paper, or across records.

Business Value:
Every service record can be referenced by a short, human number — the way a
handyman business actually talks about work — and documents/links stay legible.

Scope:
- Add per-account sequential numbers for jobs and estimates, mirroring the
  existing `invoice_number` pattern (additive migration + unique index per
  account, one-time backfill of existing rows).
- Surface the number on job and estimate detail/list pages and on any generated
  documents.

Out of Scope:
- Configurable formats/prefixes (fixed `J-YYYY-####` / `EST-YYYY-####` to start).
- Re-numbering beyond the one-time backfill.

Acceptance Criteria:
- [ ] New jobs receive a unique per-account job number.
- [ ] New estimates receive a unique per-account estimate number.
- [ ] Numbers are shown on the respective detail and list views.
- [ ] Migration is additive and reversible; existing rows are backfilled.

Notes:
Invoice numbering is the reference implementation (`invoices.invoice_number`,
unique index per account). Identified as a genuine gap in the June 2026 recovery fact-check retained in git history; that fact-check also corrected the earlier assumption that invoice numbering was missing — it exists.

## Completed

- [TASK-020: PWA Installability](../archive/backlog-done/TASK-020-pwa-installability.md) — Done

- [TASK-033: Read-Only Business MCP Server](../archive/backlog-done/TASK-033-read-only-mcp.md)
