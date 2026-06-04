# Product Complexity Reduction Report

Date: 2026-06-04

Authority:

- `docs/canonical/PRODUCT_VISION.md`
- `docs/canonical/DOMAIN_MODEL.md`
- `docs/canonical/WORKFLOW.md`
- `docs/canonical/ARCHITECTURE.md`
- `docs/canonical/ROADMAP.md`
- `docs/generated/PRODUCT_ALIGNMENT_AUDIT_PHASE_1.md`

Scope: Phase A hides visible entry points into routes classified `REMOVE` and consolidates visible navigation toward the canonical workflow. No route files, database tables, workflow state machines, or application schemas were removed.

## Summary

Phase A reduces visible product complexity by removing old navigation and shortcut paths while preserving underlying routes for historical access and existing deep links.

| Metric | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Physical page routes | 71 | 71 | 0% |
| Visible/navigable route surfaces | 71 | 48 | 32.4% |
| Owner/admin primary navigation items | 9 | 9 | 0% |
| Technician primary navigation items | 2 | 2 | 0% |
| Settings tool links | 10 | 4 | 60.0% |
| Extra settings pricing cards | 1 | 0 | 100.0% |

The visible route count treats hidden `REMOVE` routes, hidden/merged `BETA` routes, and non-target support routes removed from primary navigation as no longer visible surfaces. The physical route count remains unchanged by design.

## Route Count Method

Before count:

- `apps/web/app/**/page.tsx`: 71 physical page routes.

After visible count:

- 71 physical routes.
- 23 routes hidden from primary navigation, settings shortcuts, dashboard shortcuts, or contextual shortcut links.
- 48 remaining visible/navigable surfaces.

Hidden route surfaces:

| Route | Phase A disposition | Reason |
| --- | --- | --- |
| `/app/booking-requests` | HIDE | Replaced by canonical `/app/requests` list. Detail routes remain reachable from Requests. |
| `/app/pipeline` | HIDE | Redirect-only duplicate of workflow route. |
| `/app/maintenance-plans` | HIDE | Classified `REMOVE`. |
| `/app/maintenance-plans/new` | HIDE | Classified `REMOVE`. |
| `/app/maintenance-plans/[id]` | HIDE | Classified `REMOVE`. |
| `/app/maintenance-plans/[id]/edit` | HIDE | Classified `REMOVE`. |
| `/app/maintenance-plans/[id]/enrollment-summary` | HIDE | Classified `REMOVE`. |
| `/app/maintenance-plans/addons` | HIDE | Classified `REMOVE`. |
| `/app/maintenance-plans/templates` | HIDE | Classified `REMOVE`. |
| `/app/maintenance-plans/templates/new` | HIDE | Classified `REMOVE`. |
| `/app/maintenance-plans/templates/[id]/edit` | HIDE | Classified `REMOVE`. |
| `/app/membership-dashboard` | HIDE | Classified `REMOVE`. |
| `/app/settings/membership-pricing` | HIDE | Classified `REMOVE`. |
| `/estimate/respond` | HIDE | Legacy public estimate response route. |
| `/app/pricing-dashboard` | MERGE/HIDE | Estimate health belongs in Estimates or Reports. |
| `/app/automations` | HIDE | Support route, not canonical workflow. |
| `/app/inbox` | HIDE | Support route, not canonical workflow. |
| `/app/workflow` | MERGE/HIDE | Job workflow belongs in Jobs board and route-specific detail screens. |
| `/app/operations-dashboard` | MERGE/HIDE | Operational summary belongs in Today and Reports. |
| `/app/field` | MERGE/HIDE | Technician visible entry point becomes `/app/visits`. |
| `/app/mileage` | HIDE | Removed from primary navigation target. |
| `/app/mileage/new` | HIDE | Hidden with mileage surface. |
| `/app/mileage/vehicles` | HIDE | Hidden with mileage surface. |

## Navigation Redesign

### Current Owner/Admin Navigation

Primary navigation before Phase A:

```text
Today
Requests
Clients
Properties
Estimates
Jobs
Invoices
Mileage
Settings
```

Settings shortcuts before Phase A:

```text
Schedule
Requests
Workflow
Reports
Operations Dashboard
Pricing Dashboard
Membership Dashboard
Automations
Price Book
Expenses
Membership Pricing
System Health
```

### Proposed Owner/Admin Navigation

Primary navigation after Phase A:

```text
Today
Requests
Clients
Properties
Estimates
Jobs
Invoices
Reports
Settings
```

Settings shortcuts after Phase A:

```text
Schedule
Reports
Price Book
Expenses
System Health
```

### Current Technician Navigation

```text
My Day
On Site
```

### Proposed Technician Navigation

```text
My Day
Visits
```

## Route Consolidation Report For BETA Routes

| Route | Decision | Phase A action |
| --- | --- | --- |
| `/estimate/respond` | HIDE | No new visible links added; remains out of app navigation. |
| `/app/visits/[id]/assessment` | KEEP | Contextual visit sub-flow remains reachable from Visit detail. |
| `/app/pricing-dashboard` | MERGE | Removed from Settings shortcuts. Future visibility should be through Estimates or Reports only. |
| `/app/automations` | HIDE | Removed from Settings shortcuts. |
| `/app/inbox` | HIDE | Kept out of primary navigation and Settings shortcuts. |
| `/app/workflow` | MERGE | Removed from Settings shortcuts and job progress pills. Jobs remains the canonical work board. |
| `/app/operations-dashboard` | MERGE | Removed from Settings shortcuts; remaining internal anchor link avoids cross-dashboard navigation. |

## Duplicate Workflows Removed

| Duplicate workflow | Phase A result |
| --- | --- |
| Old request list vs canonical Requests | Old list hidden from backlinks and modal footer links; canonical Requests is the visible list. |
| Pipeline redirect vs workflow board vs Jobs board | Pipeline stays hidden; workflow shortcut removed; Jobs remains visible. |
| Workflow progress route links inside Job detail | Stage pills are now non-link progress indicators. |
| Technician On Site vs Visits | Technician navigation and My Day shortcut now point to Visits. |
| Client page deprecated plan shortcut | Removed from Client 360 header and detail card. |
| Visit follow-up shortcut into hidden route family | Removed from Visit detail. |

## Duplicate Dashboards Removed

| Dashboard | Phase A result |
| --- | --- |
| Operations Dashboard | Removed from Settings shortcuts; merged conceptually into Today and Reports. |
| Pricing Dashboard | Removed from Settings shortcuts; merged conceptually into Estimates and Reports. |
| Membership Dashboard | Removed from Settings shortcuts and Today cards. |
| Workflow Dashboard | Removed from Settings shortcuts and Job detail progress links. |

## Files Updated

Navigation:

- `apps/web/components/AppShell.tsx`
- `apps/web/components/ui/__tests__/design-system.unit.test.ts`

Visible shortcut cleanup:

- `apps/web/app/app/page.tsx`
- `apps/web/app/app/settings/page.tsx`
- `apps/web/app/app/my-day/page.tsx`
- `apps/web/app/app/clients/[id]/page.tsx`
- `apps/web/app/app/visits/[id]/page.tsx`
- `apps/web/app/app/properties/[id]/PropertyTimeline.tsx`
- `apps/web/app/app/intake/new/page.tsx`
- `apps/web/app/app/intake/new/IntakeForm.tsx`
- `apps/web/components/LeadCaptureSheet.tsx`
- `apps/web/app/app/jobs/[id]/JobCommandPanel.tsx`
- `apps/web/app/app/operations-dashboard/page.tsx`

Report:

- `docs/generated/PRODUCT_COMPLEXITY_REDUCTION_REPORT.md`

## Remaining Visible Duplicates

These were intentionally not changed in Phase A because changing them would go beyond visible navigation reduction:

| Remaining duplicate | Reason retained |
| --- | --- |
| `/app/booking-requests/[id]` detail routes | Canonical Requests still uses these detail routes for review/action. |
| `/app/visits/[id]/assessment` | Kept as visit-context work until Phase C can fold execution into the Visit experience. |
| `/app/schedule` | Still available as a support tool in Settings. |
| `/app/price-book` | Still available as a support tool in Settings. |
| `/app/expenses` | Still available as a support tool in Settings. |

## Broken References

No broken references were introduced intentionally. Remaining references to hidden route families are internal to those hidden route files or are detail links still used by canonical surfaces.

Verification command:

```bash
rg -n '/app/(booking-requests|maintenance-plans|membership-dashboard|settings/membership-pricing|pipeline|operations-dashboard|pricing-dashboard|automations|workflow|field)' apps/web/app apps/web/components -g '*.tsx'
```

Expected remaining matches:

- Canonical Requests links into `/app/booking-requests/[id]`.
- Internal links within hidden route families.
- API fetches that preserve existing behavior.

## Boundary

No application routes were deleted. No database objects were added, changed, or removed. No workflow state names were changed. This phase reduces what users are shown, not what historical links can resolve.
