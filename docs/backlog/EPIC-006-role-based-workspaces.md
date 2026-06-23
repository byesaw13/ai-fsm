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

# TASK-028: Phase 0 — Extract WorkdayPanel (pure refactor)

Status: Proposed

Extract the field-workday UI (`start_day`/`work_day`/`end_day` tabs, vehicle +
odometer, Start/End Day, switch/correct/discard, `NowBar`, mileage summary) from
`DailyCommandCenter.tsx` into a new shared `WorkdayPanel.tsx`. The owner dashboard
still renders it (no behavior change). Verify Start Day → drive → End Day
end-to-end. No data-layer change.

Acceptance:
- [ ] `WorkdayPanel` renders identically to today's field tabs.
- [ ] No behavior/visual change on `/app`.
- [ ] Start/End Day, vehicle switch, and Discard still work.

# TASK-029: Phase 1 — My Day becomes the field home

Status: Proposed

Mount `WorkdayPanel` + activity + mileage in `MyDayView`; move the field queries
(`openSession`, `vehicles`, `activityEntries`, mileage) into `my-day/page.tsx`;
remove the `non-tech → /app` redirect; add "My Day" to owner/admin nav.

Acceptance:
- [ ] Owner can open `/app/my-day` and Start/End Day there.
- [ ] Tech My Day gains the workday actions above the assigned-visits list.

# TASK-030: Phase 2 — Slim the Owner Dashboard

Status: Proposed

Remove `WorkdayPanel`/activity/mileage from `/app`; keep action-queue + revenue +
material widgets; drop the field queries from `/app/page.tsx`; restyle as the
management dashboard.

Acceptance:
- [ ] `/app` shows only business widgets; no field actions.
- [ ] `/app/page.tsx` no longer fetches field data.

# TASK-031: Phase 3 — Role routing & hardening

Status: Proposed

Generalize landing (`owner/admin → /app`, `tech → /app/my-day`); add the header
Dashboard ↔ My Day switch; close URL-level guards so techs can't reach business
routes.

Acceptance:
- [ ] Each role lands on the correct default page.
- [ ] A tech hitting a business URL is redirected to My Day.

# TASK-032: Phase 4 — Owner widgets & polish

Status: Proposed

Owner widgets (invoice aging, technician productivity, open decisions), mobile
bottom-bar updates per role, tests.

Acceptance:
- [ ] Owner dashboard has the management widgets.
- [ ] Mobile bottom bar matches role.

# TASK-038: Surface consolidation — one daily home, fewer overlapping dashboards

Status:
Done

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
daily home is now My Day, not `/app`. Evidence basis for the broader cleanup is
the June 2026 recovery fact-check
(`docs/generated/RECOVERY_AUDIT_FACT_CHECK_2026-06.md`).

## Completed

_None yet._
