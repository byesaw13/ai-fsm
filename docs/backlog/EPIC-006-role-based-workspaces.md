# EPIC-006: Role-Based Workspaces (Owner Dashboard / My Day)

Separate "run the business" (Owner Dashboard) from "do the work" (Technician My
Day), even when one person does both. Owner Dashboard answers *"What needs my
attention?"*; My Day answers *"What do I do right now?"*.

## Audit (current state, 2026-06-20)

- **Roles** exist: `owner`, `admin`, `tech` (`lib/auth/middleware.ts`), with
  fine-grained capabilities in `lib/auth/permissions.ts` and RLS in the DB.
- **Landing is mutually exclusive**: `/app/page.tsx` redirects `tech → /app/my-day`;
  `/app/my-day/page.tsx` redirects **non-tech → /app**. The owner cannot reach
  My Day today.
- **Field UI lives in the owner's Command Center**: `DailyCommandCenter.tsx`
  (rendered at `/app`) holds the `start_day`/`work_day`/`end_day` tabs (vehicle,
  odometer, Start/End Day, vehicle switch, Discard), the `NowBar` activity timer,
  and the mileage summary — **plus** the business action-queue + revenue metrics.
- **My Day is visits-only**: `MyDayView.tsx` shows assigned visits with
  start/complete transitions. No workday actions, vehicle, activity, or mileage.
- **Nav** (`AppShell.tsx`, `getNavSections`): tech → [My Day, Visits]; owner/admin
  → [Today, Requests, Clients, Properties, Estimates, Jobs, Schedule, Invoices,
  Reports, Settings]. No "My Day" for owner/admin.
- Business pages already carry page-level role guards (partial).

**Core problem:** field-execution UI is trapped in the owner dashboard, and the
owner is blocked from My Day. The fix is mostly *redistribute + unlock*, not
build-from-scratch.

## Architecture

> **Historical (2026-06):** the `WorkdayPanel`/`DailyCommandCenter` design below was
> superseded — the field home became My Work. See the reconciled TASK-028–032 (Done)
> in Tasks for what actually shipped. Kept for context, not as current intent.

- **Owner Dashboard** (`/app`) → business only: revenue, ops action-queue,
  management nav. (Keeps the existing action-queue + metrics from `page.tsx`.)
- **My Day** (`/app/my-day`) → field only: workday actions, assigned work,
  activity/mileage/capture. Becomes the home for the field components.
- **Key decision:** extract the field-workday UI out of `DailyCommandCenter.tsx`
  into a shared **`WorkdayPanel`** used by My Day (tech *and* owner-as-tech), so
  the Start/End-Day logic isn't duplicated.

## Database / permissions

- No schema migration required for the core split (roles + RLS + permissions
  already exist).
- Harden URL-level guards so a `tech` can't reach
  `/app/estimates|invoices|reports|settings|price-book` by URL (centralize a
  `requireRole()` page helper).
- Optional/deferred: a `users.default_view` column only if owners later want a
  customizable landing — not needed for the deterministic role→landing rule.

## Navigation

```
Owner / Admin:                      Technician:
  Dashboard (/app)                    My Day (/app/my-day)
  My Day    (/app/my-day)  ← NEW      Jobs (assigned)
  Clients · Jobs · Estimates ·        Customers (assigned)
  Invoices · Schedule · Reports ·     Photos · Time Tracking
  Settings
```
Plus a header **Dashboard ↔ My Day** switch (the owner's "act as technician"
toggle). Rename the owner "Today" nav label to "Dashboard".

## Risks

- `DailyCommandCenter` is large/stateful — extraction can break Start/End-Day.
  Mitigate with a pure Phase-0 extraction (owner page unchanged) verified
  end-to-end before moving anything.
- Owner loses one-tap Start Day on the home page — mitigated by the nav item +
  header switch.
- Don't entangle with the live location-capture work (TASK-024..027); keep
  captured-locations/day-map on My Day/timeline.

## Migration posture (minimize disruption)

- Keep `/app` and `/app/my-day` as stable URLs (no renames; PWA shortcuts
  survive). Strangler approach: Phase 0 is behavior-identical; the owner
  dashboard only *loses* field widgets in Phase 2, *after* My Day already hosts
  them — Start Day is never unreachable.

## Tasks

> **TASK-028–032 reconciliation (2026-07).** These five tasks were a
> `WorkdayPanel`-based decomposition of the owner↔field split. That plan was
> overtaken: the field home became **My Work** (`apps/web/app/app/my-work/`,
> `MyDayMobileLayout`) via TASK-038/058/059, `DailyCommandCenter.tsx` was removed,
> and the never-mounted `WorkdayPanel.tsx` / `BusinessDayBar.tsx` were deleted as
> dead code in PR #533. Each task's **outcome shipped** through My Work rather than
> a shared panel — recorded per ID below (all Done, verified in code). No further
> build here; new field-cockpit work is TASK-074/075.

# TASK-028: Extract the field UI into a reusable surface

Status:
Done

Phase:
0

Done via My Work (reconciled — see note above). The field-workday UI (`ClockBar`,
`FieldRightNowCard`, `StartMyDayWizard`, `VehicleRow`) lives in the My Work
components, not duplicated in the owner dashboard. The literal
`DailyCommandCenter → WorkdayPanel` extraction this task named is moot — both are
gone (`WorkdayPanel` deleted in PR #533).

# TASK-029: Field home gains workday actions; owner can reach it

Status:
Done

Phase:
0

Done via My Work. `/app/my-work` hosts start/end-day, activity, and vehicle; techs
land there (`app/app/page.tsx` redirects `tech → /app/my-work`); owners reach it
via the "My Day" nav item (`components/AppShell.tsx`, `NAV_MY_DAY`).

# TASK-030: Slim the owner dashboard to business-only

Status:
Done

Phase:
0

Done. `OwnerDashboard.tsx` renders only Tomorrow's Plan, Financial Snapshot, and
Quick Actions — no field widgets or field queries.

# TASK-031: Role landing + tech URL guards

Status:
Done

Phase:
0

Done. Landing routes by role; techs are redirected off business routes
(`estimates`, `invoices`, `price-book` → `/app/my-work`; `reports` gated by
`canViewReports`; `settings` shows techs only their profile) — the guards cite
EPIC-006 in-code.

# TASK-032: Owner widgets + role-aware mobile nav

Status:
Done

Phase:
0

Done. Invoice aging and technician productivity are consolidated into Reports
(`app/app/reports/sections/InvoiceAgingSection.tsx`, `TechnicianSection`) per
TASK-038; `AppShell` renders a role-filtered nav plus a mobile bottom-bar subset.

# TASK-038: Surface consolidation — one daily home, fewer overlapping dashboards

Status:
Done

Phase:
0

Problem:
Five operational surfaces — Today (`/app`), My Day, Schedule, Visits, Timeline —
read as redundant dashboards. Owner/admin couldn't tell which to open, and there
was no single screen to watch a visit move through its statuses while testing the
core workflow. The owner/admin visit triage (Overdue / Needs-assignment / status
groups) lived only at `/app/visits`, which is not in their nav.

Business Value:
The owner runs the day from one clear home, with the other surfaces demoted to
distinct, discoverable roles — directly reducing the "is this built or lost?"
confusion.

Scope:
- Step 1 (done — PR #362): My Day is the role-aware landing; the `/app` dashboard
  is relabelled "Overview" and demoted next to Reports but kept reachable. Pure
  admins still land on the Overview dashboard.
- Step 2 (done — PR #363): Schedule gains an admin-only "List" view that surfaces
  the visit triage, reusing one shared `buildVisitTriage` + `VisitTriage` across
  the Visits page and Schedule. Also fixed a latent `filter(isVisitOverdue)` bug
  that left the Overdue bucket and metric silently empty (fixed on My Day too).
- Step 3 (done — PR #365): relocated the Invoice Aging KPI to a Reports section
  and dropped the duplicate "Completed This Month" card (Reports' TechnicianSection
  covers it); added an "Activity Timeline →" link in the Reports header and removed
  the Timeline quick-action. Kept the Financial Snapshot money-glance on the home.

Out of Scope:
- The tech field experience — techs keep their own Visits screen and nav.

Acceptance Criteria:
- [x] Owner/tech land on My Day; pure admins stay on the Overview dashboard.
- [x] Schedule exposes the visit triage via an admin-only List view.
- [x] The Overdue triage/metric actually populates (bug fixed + unit-tested).
- [x] Overview KPIs and the Activity Timeline live under Reports.
- [x] Timeline is removed from quick-actions and the daily navigation.

Notes:
Refines the owner-dashboard-centric assumption in TASK-030/031/032: the owner's
daily home is now My Day, not `/app`. Evidence basis for the broader cleanup is the June 2026 recovery fact-check retained in git history.

# TASK-074: My Work — "Next action" + stale-state prompts

Status:
Proposed

Phase:
1

Problem:
My Work shows the field user's *current* state (clock, running activity, vehicle)
via `FieldRightNowCard` / `ClockBar` / `VehicleRow`, but never tells them what to
do next, and never flags when the state looks wrong. The two costly field mistakes
go uncaught: a time-clock left running after the last visit (inflated payroll) and
a stretch of worked time with no activity attached (lost billable). "What now?" is
reconstructed in the user's head every time.

Business Value:
One glance answers "what's the next tap," and the app catches the clock-left-running
and untracked-time mistakes before they reach payroll or an invoice. This is the
field-surface realization of TASK-056's "power proactive prompts" — put on the
screen where the field user actually is.

Scope:
- Consume the Current Operations State read model (`lib/operations/state.ts`:
  `getCurrentOperationsState` + `deriveValidTransitions`) on My Work.
- Render a single **"Next: <action>"** affordance from the legal transitions the
  read model already returns (surface, don't auto-execute).
- Render a calm, non-nagging **stale hint** past a tunable threshold: clocked-in
  with no activity change for N minutes; an activity running with no assignment.
  One constant, easy to tune from real field use.
- Prefer the server-load path (My Work is server-rendered — call the lib directly).
  Only reinstate an HTTP read route if a live client-side poll is proven necessary
  (the unused `/api/v1/operations/state` wrapper was removed in PR #533 and can be
  re-added thin).

Out of Scope:
- Auto-executing any transition (surface only).
- The operational inbox UI (TASK-049); presence signals (TASK-057); persisting
  state history.

Acceptance Criteria:
- [ ] My Work shows the next legal action derived from the live ops state.
- [ ] A stale-clock / stale-activity hint appears past a tunable threshold and
      clears when the user resolves it.
- [ ] The next-action + stale derivation is a pure, unit-tested rule.
- [ ] Nothing auto-mutates; every prompt is a one-tap the user confirms.

Notes:
Phase 1 consumer of TASK-056 (EPIC-001). The read model and `deriveValidTransitions`
unit tests already exist; this task is the field-surface wiring TASK-056 calls for.
Field home is My Work, not the removed `WorkdayPanel` (see superseded note above).

# TASK-075: Field workflow — fewer taps from job → materials → invoice → closeout

Status:
Proposed

Phase:
2

Problem:
Finishing work from My Work still means hopping between separate screens: log the
materials on one page, find the job, open the invoice, then close the visit out.
Every hop is taps and navigation done one-handed in the field, and each is a place
a step gets dropped (materials never logged, a visit left un-closed).

Business Value:
Compresses the end-of-work path so the field user records materials and moves toward
invoice/closeout without leaving the work context — fewer dropped steps, cleaner
records, less re-work at the desk later.

Scope:
- From the active visit/work context on My Work, inline the next steps — log a
  material, mark tasks/visit done — as one-tap actions in the same flow instead
  of separate destinations.
- Reuse existing routes and actions (materials capture, visit completion). This
  is navigation/affordance consolidation, not new backend.
- **Invoice handoff is project completion, not visit completion.** By design a
  visit completing keeps the project open and never drafts an invoice; the draft
  *final* invoice is created only by the owner's explicit project completion
  (`apps/web/app/api/v1/jobs/[id]/transition/route.ts` → `createDraftFinalInvoiceForJob`).
  So when the last visit of a job is done, surface the **project-completion**
  action (which drafts the final invoice for billing review) — reusing that
  route — rather than implying a visit drafts an invoice.

Out of Scope:
- New billing logic or the estimate side.
- Changing when a final invoice is created (project completion stays the trigger).
- Anything needing a new table or route (scope freeze — reuse existing surfaces).

Acceptance Criteria:
- [ ] From an in-progress visit on My Work, a field user logs a material and
      completes the visit without navigating to a separate page.
- [ ] When a job's last visit is complete, the owner's project-completion action
      (which drafts the final invoice) is reachable in one tap from that context.
- [ ] No new tables or routes; the final-invoice trigger is unchanged.

Notes:
Phase 2 (after Phases 0–1 are boringly reliable; respects the scope freeze by
reusing existing surfaces). Field home is My Work (`apps/web/app/app/my-work/`,
`MyDayMobileLayout`).

# TASK-081: Nested hubs UX system (Home / Work / People / Money)

Status:
In Progress

Phase:
cross-cutting (UX shell; phases P0–P4)

Problem:
Navigation is a flat list of destinations. Field and office share one product
but chrome does not express hubs, nesting (Client → Property → Job → Visit), or
minimal-input patterns consistently. A full redesign is needed without a
greenfield rebuild.

Business Value:
- Faster daily navigation (fewer wrong taps to the next action).
- Clearer mental model for owner hybrid (phone field / desktop office).
- Shared templates so every screen can be modernized in phases.

Scope:
- **P0 (this PR):** AppShell nested hub sections; mobile bottom tabs Home/Work/
  People/Money + More; Breadcrumbs + WhatNext primitives; wire breadcrumbs on
  job detail; unit tests.
- **P1–P4:** Home surfaces, People/Work lists and details, Money + guided
  editors, ops boards + polish — per
  `docs/superpowers/specs/2026-08-01-nested-hubs-ux-design.md`.

Out of Scope:
- New domain objects or workflow steps.
- New AI product surface.
- Rewriting every page in a single PR.

Acceptance Criteria:
- [x] P0: labeled hubs in sidebar + More sheet; bottom tabs map to four hubs.
- [x] P0: role/workspace home rules preserved (owner field My Day, admin Overview).
- [x] P0: Breadcrumbs + WhatNext primitives exported; job detail uses breadcrumbs.
- [x] P1: My Day + Overview field-hero / what-needs-you chrome; start-day sheet + arrival confirm.
- [x] P2: Work/People hub subnav on lists; breadcrumbs on client/property/visit/estimate (+ job).
- [x] P3: Money hub chips; invoice/expense breadcrumbs; WhatNext billing queue; T4 new-form guidance.
- [ ] P4: ops boards polish + a11y/field sweep.

Notes:
Spec: `docs/superpowers/specs/2026-08-01-nested-hubs-ux-design.md`  
Plan (P0): `docs/superpowers/plans/2026-08-01-nested-hubs-ux.md`

## Completed

- [TASK-058: Workspace mode auto-by-device + Settings override](../archive/backlog-done/TASK-058-workspace-auto-route.md) — Done
