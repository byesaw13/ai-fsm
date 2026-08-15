# EPIC-005: Platform & Delivery

How the app is packaged, served, and installed — the delivery surface beneath
the product features. Concerns here are cross-cutting (installability, secure
origin, offline behavior, deployment shape) rather than tied to any one
workflow.

## Active tasks

# TASK-034: MCP Non-Superuser RLS Verification

Status:
Cancelled (MCP package deleted, TASK-109)

Phase:
cross-cutting

Problem:
The MCP integration tests ran as a superuser, so RLS was unverified.

**Status note (PR / TASK-109):** `services/mcp` is gone. No MCP surface to verify.

# TASK-109: Ponytail second cut — MCP, dead APIs, unused paint helpers

Status:
Done

Phase:
cross-cutting

Problem:
Read-only MCP was never in compose or daily use. JSON twins of server pages,
membership CRUD, and unused fleet TCO routes had no UI callers. A second
painting model (`PaintRoom` / `computePaintRoom`) and
`computeSqftPaintingEstimate` had zero app callers.

Business Value:
Less unused surface. Estimate forms keep the live adapters.

Scope:
- Delete `services/mcp` and cancel TASK-034 / TASK-035.
- Delete unused JSON/TCO/membership CRUD API routes. Keep tables and RSC pages.
- Delete unused paint helpers. Keep `adapters.ts` (`sqftPaintingToSpec`,
  `roomSpecsToEstimateSpec`) — estimate UI uses them.

Out of Scope:
- Membership visit chrome, collapsing the live dual-engine mapper.

Acceptance Criteria:
- [x] MCP package gone; TASK-034 and TASK-035 Cancelled.
- [x] Deleted routes have no remaining app callers.
- [x] Live paint adapters still compile and are imported by estimate forms.

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
- [TASK-033: Read-Only Business MCP Server](../archive/backlog-done/TASK-033-read-only-mcp.md) — Done
- [TASK-083: Attention Phase 2 — estimates badge, email, prune, filters](../archive/backlog-done/TASK-083-attention-phase-2.md) — Done (PR #571)
