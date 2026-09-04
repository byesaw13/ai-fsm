# EPIC-005: Platform & Delivery

How the app is packaged, served, and installed — the delivery surface beneath
the product features. Concerns here are cross-cutting (installability, secure
origin, offline behavior, deployment shape) rather than tied to any one
workflow.

## Active tasks

# TASK-115: Promise Capture Pilot

Status:
In Progress

Phase:
1

Problem:
A promise made on a jobsite or phone call may not be available when it is
needed. The cost appears later as a dropped follow-up, a missed material, or a
customer who expected an answer.

Business Value:
A customer promise captured on Tuesday still exists in the correct AI-FSM
workflow on Thursday without Nick maintaining a second list.

Scope:
- Capture-evidence table (immutable original audio, optional uninterpreted
  photo blob, transcript, processing state, confirmation link). Explicit Phase 1
  table-freeze exception per ROADMAP.
- Additive `action_items.source_capture_id` so multiple owner promises can
  attach to one entity without colliding with legacy open-item uniqueness.
- Zero-context `/app/capture` with PWA manifest shortcut; microphone starts
  with no customer/project/visit/category/form. Owner/admin only. Requires an
  existing session; expired session is a reachability miss. After login, return
  to `/app/capture` and start the mic. Hold the blob locally until POST is
  acknowledged.
- Conservative firm-commitment extraction only. Uncertain language stays the
  original. Mixed utterances extract only the firm promise.
- Day Review promise strip, separate from AI Day Draft. Global (next opened
  review), including dates with no business day. Cap three per session. Oldest
  unsnoozed first, then snoozed-from-last-session. Snooze once, then
  replay-and-attach or dismiss.
- One writer: confirm creates one `action_items` row (`action_type =
  owner_promise`) on exactly one of booking_request, estimate, job, invoice.
  Entity picker: today's visits mapped to a supported parent, open estimates,
  unpaid invoices, customer-name search. No entity, no confirm.
- Customer Promises counted bucket on `/app` and `/app/action-queue` (danger if
  any open promise is overdue, else warning). Destination is the open promise
  rows on `/app/action-queue`, not a new inbox. One-tap resolve sets
  `resolved_at`. No auto-complete from invoice/estimate status.
- Web Share Target only if the shortcut misses truck-and-dirty-hands
  reachability. Native TWA only if both web routes fail.

Out of Scope:
- Coaching, weekly goals, visible direction, Owner OS framework
- Photo / computer-vision interpretation
- Broad idea/concern/opportunity classification
- Automatic call/text/email monitoring
- Energy check-ins, autonomous customer messages
- LLM ranking of the operating day or a WhatNext scorer replacement
- Visit-note, visit-task, or materials-list writers
- TASK-049 Operational Inbox
- Metrics dashboard (two-week log is paper/note)
- Unauthenticated or fully offline capture

Acceptance Criteria:
- [ ] A commitment can be recorded without opening and navigating AI-FSM (manifest shortcut to `/app/capture`).
- [ ] The immutable original survives every processing state.
- [ ] Firm commitments reappear inside Day Review; uncertain statements do not create classification work.
- [ ] Mixed utterance extracts only the firm promise.
- [ ] Confirmed commitments write one `action_items` row attached to a supported entity.
- [ ] Additive migration permits multiple promise rows on one entity and preserves legacy uniqueness for non-promise actions.
- [ ] `/app` and `/app/action-queue` add one counted Customer Promises bucket without replacing the existing tone-sorted bucket model.
- [ ] Open promise rows can be marked done; the bucket count drops.
- [ ] Promise review works on the next opened Day Review, even without a business-day record, and shows at most three items.
- [ ] Owner/admin only; tech is forbidden.
- [ ] No customer message is sent from this pilot.
- [ ] `pnpm gate:fast` passes.

Notes:
Design: `docs/superpowers/specs/2026-09-01-promise-capture-pilot-design.md`.
Do not implement TASK-049. Do not add a second task store.
`due_at` is set only when the transcript states a date, or Nick sets it on
Correct-then-attach. Null due stays warning, never invented overdue.
Someone else's promise ("Peter will send measurements") is still Nick's
`action_items` row; waiting-on lives in the title.

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

# TASK-117: Passive live refresh of app data

Status:
Done

Phase:
cross-cutting

Problem:
Pages are server-rendered and only refetch their data on a manual reload or
after an explicit `router.refresh()`. Newly-arrived server state — arrival
proposals (the "on site" popup), attention items, etc. — sits stale until the
user reloads, so field users miss the arrival prompt when they open the app.

Business Value:
The app reflects the current state of the world on its own. A tech arriving at
a job sees the arrival prompt without knowing to reload.

Scope:
- One `LiveRefresh` client component mounted once in `AppShell`; calls
  `router.refresh()` on an interval while the tab is visible and immediately on
  focus/visibility so resume surfaces new state at once.
- Guard so a refresh never yanks focus mid-edit (recent typing / open menu),
  while lingering focus after resume does not freeze refresh.

Out of Scope:
- Real-time push (SSE/WebSocket). Polling is sufficient for the current field
  headcount; revisit only if sub-30s cross-user latency is needed.

Acceptance Criteria:
- [x] Server-rendered data refreshes without a manual reload.
- [x] Refresh pauses during active typing / open menus, resumes when idle.
- [x] Mounted once, so every page under `AppShell` benefits.

## Completed

- [TASK-020: PWA Installability](../archive/backlog-done/TASK-020-pwa-installability.md) — Done
- [TASK-033: Read-Only Business MCP Server](../archive/backlog-done/TASK-033-read-only-mcp.md) — Done
- [TASK-083: Attention Phase 2 — estimates badge, email, prune, filters](../archive/backlog-done/TASK-083-attention-phase-2.md) — Done (PR #571)
