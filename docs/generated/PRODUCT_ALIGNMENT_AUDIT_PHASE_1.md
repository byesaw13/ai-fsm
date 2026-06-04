# Product Alignment Audit Phase 1

Date: 2026-06-04

## Authority

This audit uses only these product-authority documents:

- `docs/canonical/PRODUCT_VISION.md`
- `docs/canonical/DOMAIN_MODEL.md`
- `docs/canonical/WORKFLOW.md`
- `docs/canonical/ARCHITECTURE.md`
- `docs/canonical/ROADMAP.md`

Archived documentation was ignored. This audit covers UI page routes from `apps/web/app/**/page.tsx`. API routes are considered implementation surfaces and are listed through affected database/API objects in the implementation plan.

## Canonical Standard

The application should align to:

```text
Lead -> Client -> Property -> Estimate -> Job -> Visit -> Invoice -> History
```

The product center is the client/property relationship, with service history accumulating on the property.

## 1. Screen Inventory

Frequency scale:

- High: daily or near-daily operational use.
- Medium: weekly or repeated office use.
- Low: occasional setup, print, or exception use.
- Rare: admin-only, recovery, or historical edge use.

| Route | Purpose | Primary user | Frequency | Workflow step | Class |
|---|---|---|---|---|---|
| `/` | Public root entry/redirect surface. | Prospect/client | Medium | Lead | SUPPORTING |
| `/login` | Staff authentication. | Staff | High | Supporting | SUPPORTING |
| `/booking` | Public request capture. | Prospect/client | Medium | Lead | CORE |
| `/intake/[token]` | Tokenized intake completion. | Prospect/client | Medium | Lead | SUPPORTING |
| `/estimate/respond` | Legacy estimate response surface. | Client | Low | Estimate | BETA |
| `/estimate/thanks` | Estimate response confirmation. | Client | Low | Estimate | SUPPORTING |
| `/portal/login` | Client portal login. | Client | Low | Client | SUPPORTING |
| `/portal/auth/confirm` | Client portal auth confirmation. | Client | Low | Client | SUPPORTING |
| `/portal/[clientToken]` | Client portal overview. | Client | Medium | Client/Property | SUPPORTING |
| `/portal/[clientToken]/property/[propertyId]` | Client-facing property view. | Client | Low | Property/History | SUPPORTING |
| `/portal/estimates/[token]` | Client-facing estimate review. | Client | Medium | Estimate | CORE |
| `/portal/invoices/[token]` | Client-facing invoice/payment view. | Client | Medium | Invoice | CORE |
| `/app` | Staff Today/operations landing. | Owner/Admin | High | Lead/Visit/Invoice | CORE |
| `/app/requests` | Unified intake/request queue. | Owner/Admin | High | Lead | CORE |
| `/app/intake/new` | Internal request capture. | Owner/Admin | High | Lead | CORE |
| `/app/booking-requests` | Older request list. | Owner/Admin | Medium | Lead | REMOVE |
| `/app/booking-requests/[id]` | Request triage and conversion. | Owner/Admin | High | Lead -> Client/Property/Job | CORE |
| `/app/clients` | Client list/search. | Owner/Admin | High | Client | CORE |
| `/app/clients/new` | Create client. | Owner/Admin | Medium | Client | CORE |
| `/app/clients/import` | Bulk client import. | Owner/Admin | Rare | Client | SUPPORTING |
| `/app/clients/[id]` | Client detail/partial Client 360. | Owner/Admin | High | Client | CORE |
| `/app/properties` | Property list/search. | Owner/Admin | High | Property | CORE |
| `/app/properties/new` | Create property. | Owner/Admin | Medium | Property | CORE |
| `/app/properties/[id]` | Property detail, timeline, vault, active work. | Owner/Admin | High | Property/History | CORE |
| `/app/estimates` | Estimate queue/list. | Owner/Admin | High | Estimate | CORE |
| `/app/estimates/new` | Create estimate. | Owner/Admin | High | Estimate | CORE |
| `/app/estimates/[id]` | Estimate detail, guardrails, send/approve, handoff. | Owner/Admin | High | Estimate -> Job | CORE |
| `/app/estimates/[id]/print` | Printable estimate. | Owner/Admin/Client | Low | Estimate | SUPPORTING |
| `/app/estimates/[id]/shopping-list` | Materials/shopping plan for approved scope. | Owner/Admin | Medium | Estimate -> Job | SUPPORTING |
| `/app/jobs` | Job board/list. | Owner/Admin | High | Job | CORE |
| `/app/jobs/new` | Create job. | Owner/Admin | Medium | Job | CORE |
| `/app/jobs/[id]` | Job detail/work thread. | Owner/Admin | High | Job | CORE |
| `/app/jobs/[id]/visits/new` | Schedule visit from job. | Owner/Admin | High | Job -> Visit | CORE |
| `/app/visits` | Visit queue/list. | Owner/Admin/Tech | High | Visit | CORE |
| `/app/visits/[id]` | Visit execution detail. | Tech/Owner/Admin | High | Visit -> History | CORE |
| `/app/visits/[id]/assessment` | Site assessment sub-flow. | Tech/Owner/Admin | Medium | Visit -> Estimate | BETA |
| `/app/visits/[id]/print` | Printable visit report. | Owner/Admin/Client | Low | Visit/History | SUPPORTING |
| `/app/my-day` | Technician day overview. | Tech | High | Visit | CORE |
| `/app/field` | Technician on-site queue. | Tech | High | Visit | CORE |
| `/app/schedule` | Calendar view of scheduled visits. | Owner/Admin | High | Visit | SUPPORTING |
| `/app/invoices` | Invoice queue/list. | Owner/Admin | High | Invoice | CORE |
| `/app/invoices/new` | Create invoice. | Owner/Admin | Medium | Invoice | CORE |
| `/app/invoices/[id]` | Invoice detail, payment, send/status. | Owner/Admin | High | Invoice | CORE |
| `/app/price-book` | Pricing catalog support. | Owner/Admin | Medium | Estimate | SUPPORTING |
| `/app/pricing-dashboard` | Pricing analytics dashboard. | Owner/Admin | Low | Estimate | BETA |
| `/app/reports` | Business reports. | Owner/Admin | Medium | Supporting | SUPPORTING |
| `/app/reports/close` | Month-end close workflow. | Owner/Admin | Low | Supporting | SUPPORTING |
| `/app/expenses` | Expense tracking. | Owner/Admin | Medium | Job/Invoice support | SUPPORTING |
| `/app/expenses/new` | Create expense. | Owner/Admin | Medium | Job support | SUPPORTING |
| `/app/expenses/[id]` | Expense detail/edit/documents. | Owner/Admin | Low | Job support | SUPPORTING |
| `/app/mileage` | Mileage/session tracking. | Owner/Admin | Medium | Job/Visit support | SUPPORTING |
| `/app/mileage/new` | Log mileage/session. | Owner/Admin | Medium | Job/Visit support | SUPPORTING |
| `/app/mileage/vehicles` | Vehicle setup/list. | Owner/Admin | Low | Supporting | SUPPORTING |
| `/app/automations` | Automation configuration. | Owner/Admin | Low | Supporting | BETA |
| `/app/inbox` | Message/inbox surface. | Owner/Admin | Low | Lead/Client | BETA |
| `/app/workflow` | Derived job workflow board. | Owner/Admin | Medium | Lead -> Invoice | BETA |
| `/app/pipeline` | Redirect to workflow. | Owner/Admin | Low | Lead -> Invoice | REMOVE |
| `/app/operations-dashboard` | Operations dashboard. | Owner/Admin | Low | Visit/Invoice support | BETA |
| `/app/membership-dashboard` | Deprecated recurring-plan dashboard. | Owner/Admin | Low | Supporting | REMOVE |
| `/app/maintenance-plans` | Deprecated recurring-plan list. | Owner/Admin | Low | Supporting | REMOVE |
| `/app/maintenance-plans/new` | Deprecated recurring-plan create. | Owner/Admin | Low | Supporting | REMOVE |
| `/app/maintenance-plans/[id]` | Deprecated recurring-plan detail. | Owner/Admin | Low | Supporting | REMOVE |
| `/app/maintenance-plans/[id]/edit` | Deprecated recurring-plan edit. | Owner/Admin | Low | Supporting | REMOVE |
| `/app/maintenance-plans/[id]/enrollment-summary` | Deprecated recurring-plan print summary. | Owner/Admin | Rare | Supporting | REMOVE |
| `/app/maintenance-plans/addons` | Deprecated add-on setup. | Owner/Admin | Rare | Supporting | REMOVE |
| `/app/maintenance-plans/templates` | Deprecated template setup. | Owner/Admin | Rare | Supporting | REMOVE |
| `/app/maintenance-plans/templates/new` | Deprecated template create. | Owner/Admin | Rare | Supporting | REMOVE |
| `/app/maintenance-plans/templates/[id]/edit` | Deprecated template edit. | Owner/Admin | Rare | Supporting | REMOVE |
| `/app/settings` | Company/profile/team settings. | Owner/Admin | Low | Supporting | SUPPORTING |
| `/app/settings/system-health` | Operational health. | Owner/Admin | Rare | Supporting | SUPPORTING |
| `/app/settings/membership-pricing` | Deprecated pricing setup. | Owner/Admin | Rare | Supporting | REMOVE |

## 2. Workflow Alignment Audit

### Workflow Breaks

- Lead is split between `/booking`, `/app/requests`, `/app/booking-requests`, `/app/intake/new`, `/app/inbox`, and quick lead modal behavior. The canonical flow needs one owner-facing Lead queue plus one public lead capture path.
- Estimate -> Job -> Visit handoff exists on estimate detail, but it is still partly manual and partly routed through job pages. Approved estimate actions should consistently land in job readiness and visit scheduling.
- Visit -> History is incomplete. Visit detail captures notes, checklist, media, parts, materials, and completion packet, but property history is not always the obvious destination for durable observations.
- Client -> Property is present, but Client 360 does not make property history, documents, and photos available from one consolidated structure.

### Duplicate Steps

- `/app/requests` and `/app/booking-requests` both represent Lead intake queues.
- `/app/workflow`, `/app/jobs`, `/app/schedule`, `/app/visits`, and `/app` all expose pieces of open work.
- `/app/pricing-dashboard`, `/app/reports`, `/app/estimates`, and estimate detail all show pricing/estimate health in different forms.
- `/app/my-day`, `/app/field`, `/app/visits`, and `/app/schedule` all present visit work from different angles.

### Dead-End Screens

- `/app/pipeline` only redirects to `/app/workflow`; it should be removed as a user-facing route.
- Deprecated recurring-plan routes form a separate branch outside the canonical flow.
- `/app/inbox` is not integrated into the canonical Lead/Client queue.
- `/estimate/respond` appears legacy next to `/portal/estimates/[token]`.

### Parallel Workflows

- Workflow board and job board both classify active work.
- Schedule and visit list both manage visit timing.
- Today dashboard, operations dashboard, and workflow board all answer "what needs attention?"
- Client portal and legacy estimate response route both represent client estimate interaction.

### Unnecessary Complexity

- Too many dashboard-like screens for a product whose canonical docs explicitly reject a dashboard suite.
- Too many supporting objects are elevated into route families instead of being attached to Client, Property, Estimate, Job, Visit, or Invoice.
- Several deprecated recurring-plan routes remain visible through links from client/property/visit/dashboard code.

## 3. Client 360 Audit

### Current State

`/app/clients/[id]` is close to Client 360. It currently shows:

- Client contact details.
- Properties.
- Recent visit activity.
- Recent jobs.
- Estimates.
- Invoices.
- Communications.
- Financial metrics.

### Missing Or Incomplete

| Area | Current status | Gap |
|---|---|---|
| Estimates | Present. | Limited to recent rows; no grouped open/approved/expired structure. |
| Jobs | Present. | Recent list only; no full current/history split. |
| Visits | Partial. | Recent activity from visits only; no dedicated visit list grouped by property/job. |
| Invoices | Present. | Recent list only; no paid/open/overdue grouping beyond attention banner. |
| Property history | Missing from Client 360. | User must open each property to see timeline/history. |
| Documents | Missing. | Document links are not surfaced from client detail. |
| Photos | Missing. | Visit/property media are not visible from client detail. |

### Ideal Client 360 Structure

Reorganize the existing client detail into:

1. Header: client contact, preferred contact, primary actions.
2. Open attention: pending estimate, scheduled visit, overdue invoice, missing property info.
3. Properties: cards with latest history, next visit, open invoice/estimate count.
4. Work: jobs grouped into Active and History.
5. Financials: estimates, invoices, payments grouped by status.
6. Activity: communications plus recent visits/invoices/estimates in one chronological stream.
7. Documents/photos: linked records pulled from documents, visit media, and property media.
8. Details/edit: client metadata and notes.

## 4. Property Audit

### Current State

`/app/properties/[id]` is one of the strongest canonical surfaces. It treats Property as a first-class object by showing:

- Property identity and client link.
- Job count, visit count, active work, pending estimates, outstanding invoice amount.
- Property timeline.
- Digital home vault.
- Conditions.
- Open recurring issues.
- Jobs.
- Edit/details panel.

### Missing History

- Timeline is implemented through a page-level union query, while `property_timeline_v` also exists in the database. This creates a likely duplication of timeline logic.
- Documents and photos are not first-class sections in property history.
- Completion packets are not clearly visible as durable property records.
- Visit observations do not always clearly promote to property history.

### Duplicate Data Storage

- Property timeline logic appears both as a database view (`property_timeline_v`) and page-level query composition.
- Property condition snapshots, property issues, vault items, visit checklists, visit media, and document links all store parts of property history separately.
- Documents can link to properties, jobs, estimates, invoices, expenses, or visits, but property detail does not consolidate them.

### Disconnected Records

- Visit media and completion packets are connected to visits, not always surfaced through the property page.
- Estimate and invoice rows are included in timeline only in filtered cases; full financial history requires leaving the property page.
- Job page remains the only place for some work-thread context.

### Ideal Property Page

1. Header: address/name, client, next visit, open work.
2. Property timeline: unified chronological stream from visits, estimates, invoices, documents, photos, notes, conditions, issues, and vault updates.
3. Active work: open estimates, active jobs, scheduled visits, outstanding invoices.
4. Service history: completed visits/jobs with completion packet summaries.
5. Property knowledge: vault, conditions, issues, notes.
6. Documents/photos: grouped media and documents tied to the property.
7. Details/edit: address and notes.

## 5. Visit Execution Audit

### Can A Technician Prepare?

Partial. `/app/my-day` and `/app/field` show assigned work, and `/app/visits/[id]` includes job title, property link, schedule, issue/description, checklist, and timeline. Preparation is weakened because prior property history/photos/documents are not embedded in the visit experience.

### Can A Technician Execute?

Mostly yes. Visit detail supports status transitions, arrival/on-site action, checklists, issue capture, parts, materials, notes, time context, and rescheduling/assignment where allowed.

### Can A Technician Document?

Mostly yes. Visit detail supports notes, checklist items, photos/media, parts, materials used, completion checklist, and completion packet.

### Can A Technician Complete?

Mostly yes. Completion checklist and visit transitions exist, with guardrails around repair flow evidence and closing checklist state.

### Can A Technician Recommend?

Partial. Site visits can lead to estimate creation, repair visits can create/review change-order context, and visit summaries can include follow-up items. The recommendation flow still often leaves the visit context and is not consistently represented as property history.

### Visit Gaps

- Site assessment is a separate route (`/app/visits/[id]/assessment`) instead of being a clearly embedded visit tab/section.
- Recommendations are not consistently tied to property history and next estimate/job actions.
- Prior property history is accessible by link, not as part of visit preparation.
- Some panels are conditional by non-canonical visit modes, which increases technician cognitive load.
- Documents are not visible in the visit execution surface.

## 6. Dashboard Audit

| Dashboard | Unique purpose | Overlap | Recommendation |
|---|---|---|---|
| `/app` | Daily owner/admin attention surface: requests, schedule, action queue, business health. | Overlaps operations dashboard, reports, workflow. | KEEP as Today/home. Remove broad dashboard language where possible. |
| `/app/operations-dashboard` | Operations KPIs. | Overlaps `/app`, `/app/workflow`, `/app/schedule`, `/app/visits`. | MERGE into `/app` or remove if no unique action survives. |
| `/app/pricing-dashboard` | Estimate pricing health. | Overlaps estimate list/detail guardrails and reports. | MERGE into `/app/estimates` filters or a report section. |
| `/app/membership-dashboard` | Deprecated recurring-plan analytics. | Outside canonical product flow. | REMOVE. |
| `/app/reports` | Business reporting: revenue, expenses, margin, month filters. | Some overlap with `/app` business health and pricing dashboard. | KEEP as reports, not dashboard. |
| `/app/workflow` | Derived workflow/job board. | Overlaps jobs list, schedule, visits, requests. | MERGE into `/app/jobs` as a derived board view. |

## 7. Navigation Audit

Current owner/admin left navigation:

| Nav item | Recommendation | Reason |
|---|---|---|
| Today (`/app`) | KEEP | High-frequency attention surface. |
| Requests (`/app/requests`) | KEEP | Canonical Lead queue. |
| Clients (`/app/clients`) | KEEP | Canonical Client object. |
| Properties (`/app/properties`) | KEEP | Canonical Property object and product center. |
| Estimates (`/app/estimates`) | KEEP | Canonical Estimate object. |
| Jobs (`/app/jobs`) | KEEP | Canonical Job object. |
| Invoices (`/app/invoices`) | KEEP | Canonical Invoice object. |
| Mileage (`/app/mileage`) | HIDE | Support function; should live under reports/settings or job support unless used daily. |
| Settings (`/app/settings`) | KEEP | Operational support. |

Current technician navigation:

| Nav item | Recommendation | Reason |
|---|---|---|
| My Day (`/app/my-day`) | KEEP | Technician preparation and daily queue. |
| On Site (`/app/field`) | MERGE | Useful entry point, but should be a filtered state of My Day or Visit execution rather than a separate mental model. |

Routes that should not appear in primary navigation:

- `/app/booking-requests`
- `/app/workflow`
- `/app/pipeline`
- `/app/operations-dashboard`
- `/app/pricing-dashboard`
- Deprecated recurring-plan routes
- `/app/automations`
- `/app/inbox`

## 8. Implementation Plan

### Phase A: Client 360

Goal: Make `/app/clients/[id]` the single place to understand a client relationship.

Affected routes:

- `/app/clients/[id]`
- `/app/clients`
- `/app/properties/[id]`
- `/app/estimates/[id]`
- `/app/jobs/[id]`
- `/app/visits/[id]`
- `/app/invoices/[id]`

Affected components:

- `apps/web/app/app/clients/[id]/page.tsx`
- `apps/web/app/app/clients/ClientForm.tsx`
- `apps/web/components/ui/Timeline.tsx`
- document/media panels currently under expense/visit/property routes

Affected database objects:

- `clients`
- `properties`
- `jobs`
- `visits`
- `estimates`
- `invoices`
- `payments`
- `communications_log`
- `document_links`
- `visit_media`
- `completion_packets`
- `property_vault_item_media`

Risk: Medium. The page already aggregates many tables; adding property history/documents/photos increases query size and permission complexity.

Estimated effort: Medium.

### Phase B: Property History

Goal: Make property history the durable record for visits, documents, photos, estimates, invoices, and completion.

Affected routes:

- `/app/properties/[id]`
- `/app/visits/[id]`
- `/app/estimates/[id]`
- `/app/invoices/[id]`
- `/app/jobs/[id]`

Affected components:

- `apps/web/app/app/properties/[id]/page.tsx`
- `apps/web/app/app/properties/[id]/PropertyTimeline.tsx`
- `apps/web/app/app/properties/PropertyVaultSection.tsx`
- `apps/web/app/app/properties/VaultItemPhotoPanel.tsx`
- `apps/web/app/app/visits/[id]/PhotoGrid.tsx`
- `apps/web/app/app/visits/[id]/VisitSnapshotPanel.tsx`

Affected database objects:

- `properties`
- `property_timeline_v`
- `property_vault_items`
- `property_vault_item_media`
- `property_condition_snapshots`
- `property_issues`
- `property_notes`
- `document_links`
- `visit_media`
- `completion_packets`
- `visits`
- `estimates`
- `invoices`

Risk: Medium. The main risk is duplicating history logic between SQL view and page-level unions.

Estimated effort: Medium to High.

### Phase C: Visit Execution

Goal: Let technicians prepare, execute, document, complete, and recommend from the visit experience.

Affected routes:

- `/app/my-day`
- `/app/field`
- `/app/visits`
- `/app/visits/[id]`
- `/app/visits/[id]/assessment`
- `/app/properties/[id]`

Affected components:

- `apps/web/app/app/my-day/MyDayView.tsx`
- `apps/web/app/app/field/FieldVisitCard.tsx`
- `apps/web/app/app/visits/[id]/page.tsx`
- `apps/web/app/app/visits/[id]/VisitCommandBanner.tsx`
- `apps/web/app/app/visits/[id]/VisitChecklistForm.tsx`
- `apps/web/app/app/visits/[id]/VisitNotesForm.tsx`
- `apps/web/app/app/visits/[id]/CompletionChecklist.tsx`
- `apps/web/app/app/visits/[id]/VisitSnapshotPanel.tsx`
- `apps/web/app/app/visits/[id]/assessment/AssessmentForm.tsx`

Affected database objects:

- `visits`
- `visit_checklist_items`
- `visit_media`
- `visit_parts`
- `visit_materials`
- `visit_time_logs`
- `completion_packets`
- `site_visit_assessments`
- `property_issues`
- `property_condition_snapshots`
- `document_links`

Risk: Medium. Visit detail is already complex; alignment should simplify sections rather than add more branches.

Estimated effort: Medium.

### Phase D: Estimate -> Job -> Visit Automation

Goal: Make the approved-estimate handoff to job readiness and visit scheduling consistent.

Affected routes:

- `/app/estimates/[id]`
- `/app/estimates/new`
- `/app/estimates/[id]/shopping-list`
- `/app/jobs/[id]`
- `/app/jobs/[id]/visits/new`
- `/app/schedule`
- `/app/visits/[id]`

Affected components:

- `apps/web/app/app/estimates/[id]/EstimateConvertButton.tsx`
- `apps/web/app/app/estimates/[id]/EstimateTransitionForm.tsx`
- `apps/web/app/app/estimates/[id]/page.tsx`
- `apps/web/app/app/jobs/[id]/WhatNextBanner.tsx`
- `apps/web/app/app/jobs/[id]/JobCommandPanel.tsx`
- `apps/web/app/app/jobs/[id]/page.tsx`
- `apps/web/app/app/jobs/[id]/visits/new/*`
- `apps/web/app/app/schedule/ScheduleCalendar.tsx`

Affected database objects:

- `estimates`
- `estimate_line_items`
- `estimate_options`
- `jobs`
- `visits`
- `materials`
- `service_materials`
- `price_book`
- `status_history`
- `audit_log`

Risk: Medium. Status transitions and conversion paths are sensitive; avoid changing persistence rules without tests.

Estimated effort: Medium.

### Phase E: Dashboard Consolidation

Goal: Remove parallel attention surfaces and keep dashboards as derived views, not product centers.

Affected routes:

- `/app`
- `/app/workflow`
- `/app/pipeline`
- `/app/operations-dashboard`
- `/app/pricing-dashboard`
- `/app/reports`
- Deprecated recurring-plan dashboard/routes

Affected components:

- `apps/web/app/app/page.tsx`
- `apps/web/app/app/workflow/page.tsx`
- `apps/web/app/app/jobs/JobBoard.tsx`
- `apps/web/app/app/operations-dashboard/page.tsx`
- `apps/web/app/app/pricing-dashboard/page.tsx`
- `apps/web/app/app/reports/page.tsx`
- `apps/web/components/AppShell.tsx`
- `apps/web/components/ui/__tests__/design-system.unit.test.ts`

Affected database objects:

- `jobs`
- `booking_requests`
- `visits`
- `estimates`
- `invoices`
- `expenses`
- `mileage_logs`
- `vehicle_sessions`
- `action_items`
- `status_history`

Risk: Low to Medium. Mostly navigation and route consolidation, but tests may encode current nav expectations.

Estimated effort: Medium.

## Summary Findings

- The canonical object pages exist and are viable: Client, Property, Estimate, Job, Visit, Invoice.
- Property is the strongest aligned surface, but property history still needs consolidation across documents, media, completion packets, and timeline logic.
- Client detail is close to Client 360 but lacks property history, documents, and photos.
- Visit execution is strong but should embed preparation/history/recommendation context more directly.
- The main product drift remaining in the UI is route proliferation: duplicate lead queues, duplicate workflow boards, and multiple dashboard surfaces.
- The cleanup path is consolidation and re-routing, not new feature creation.
