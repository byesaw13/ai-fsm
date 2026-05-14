# Dovetails Domain Language

Canonical terminology for Dovetails Services LLC / ai-fsm.
Read this before naming anything. AI agents must follow this reference.

## Master Rule

> Do not invent new tables to solve workflow confusion. Define language first,
> derive views from existing source-of-truth tables, simplify UI, preserve
> backward compatibility, then migrate only after field ownership is clear.

---

## Core Terms

### Job
**Definition:** The office-facing business commitment and customer work thread.

- Canonical model: `jobs` table.
- A job owns: accepted work scope, client/property context, business lifecycle,
  relationship to estimates, visits, invoices, expenses, and documents.
- A job does NOT own: per-appointment technician progress, checklist rows,
  durable property facts, or scheduling truth.
- Status = customer/business lifecycle (`draft → quoted → scheduled → in_progress → completed → invoiced`).
- Avoid calling jobs: "projects", "work orders", or "cases" in product UI.

### Visit
**Definition:** A scheduled field appointment under a job. The field execution unit.

- Canonical model: `visits` table.
- A visit owns: scheduled time window, assigned technician, field lifecycle,
  field notes, parts, media, checklist, time logs, and completion packet.
- A visit is the **source of truth for scheduling**. `jobs.scheduled_start`
  and `jobs.scheduled_end` are legacy fields — derive scheduling display
  from visits instead.
- Status = field appointment lifecycle (`scheduled → arrived → in_progress → completed | cancelled`).
- Avoid calling visits: "appointments", "service calls", or "work orders" in product UI.

### Booking Request
**Definition:** An intake record only. Captures raw submitted contact info,
service description, and preferred timing from the public booking form.

- Canonical model: `booking_requests` table.
- After conversion, `client_id`, `property_id`, `job_id`, and `visit_id` are
  **output linkages only** — the booking request does not become a work object.
- A booking request does NOT own: scope acceptance, pricing, scheduling truth
  after conversion, or field execution.
- Avoid treating booking requests as active jobs. Draft jobs linked from
  booking requests are "unaccepted work threads" until reviewed.
- Avoid calling booking requests: "leads" or "intake items" in product UI.
  Use "Booking Request" or "New Lead" in the pipeline view only.

### Membership
**Definition:** A customer-facing recurring service enrollment. The product
sold to homeowners for ongoing maintenance coverage.

- Physical storage: `maintenance_plans` table (legacy name, kept for compatibility).
- New code, UI labels, and docs should use **membership** everywhere.
- A membership owns: client/property recurring enrollment, tier, annual visit
  count, included labor cap, routing zone, renewal date, status, template
  linkage, and add-on linkage.
- A membership does NOT own: individual field execution, estimate/invoice
  pricing for non-included work.
- Avoid calling memberships: "maintenance plans", "subscriptions", or "plans"
  in product UI.

### Maintenance Plan
**Definition:** Legacy internal storage name for the membership enrollment table.

- Physical table: `maintenance_plans`.
- Kept for backward compatibility. Do not use "maintenance plan" in product UI.
- API routes at `/api/v1/maintenance-plans` are preserved; route URLs are
  internal and not customer-facing.
- Future: rename to `memberships` with a backward-compatible view. Not urgent.

### Membership Template
**Definition:** A reusable catalog definition of a membership tier — visit
count, labor cap, and base price. Used by staff to set up tier offerings.

- Canonical model: `plan_templates` table.
- UI label: **Membership Template** (not "Plan Template").
- A membership template does NOT own individual client enrollments.

### Membership Add-on
**Definition:** An a-la-carte annual service that clients can add to any
membership enrollment — gutter cleaning, dryer vent, AC condenser, etc.

- Catalog: `plan_addons` table.
- Enrollment junction: `subscription_addons` table (legacy name).
- UI label: **Membership Add-on** (not "Plan Add-on" or "Subscription Add-on").
- Pricing: flat annual price, snapshotted at enrollment time.

### Work Order
**Definition:** A rendered package of visit execution data for field reference
or customer delivery. Not a database table.

- **Do not create a `work_orders` table.**
- A "work order" is a print or PDF view of `visit + job + property + checklist`.
- If a tech needs a "work order", render it from the visit detail screen.

### Property Vault
**Definition:** Durable property facts worth carrying forward across visits —
appliance records, system ages, access notes, photos.

- Canonical model: `property_vault_items` table.
- Scope: property-level, persistent, optionally sourced from a visit observation.
- Distinct from checklist evidence (visit-specific, raw, not promoted).
- Avoid calling the vault: "asset list", "digital home vault", or "CMMS".

### Checklist Evidence
**Definition:** Structured field observations captured during a single visit.
Raw technician walkthrough data, not intended to persist beyond the visit context.

- Canonical model: `visit_checklist_items` table.
- Scope: visit-scoped only. Do not create a generic inspection system.
- Durable findings may be promoted from checklist to the property vault manually.
- Avoid calling checklist evidence: "inspection", "assessment", or "survey".

---

## Canonical Terminology Table

| Use this | Avoid in product UI |
|---|---|
| Job | Project, work order, case |
| Visit | Appointment, service call, work order |
| Booking Request | Lead, intake item, request |
| Membership | Maintenance plan, subscription, plan |
| Membership Template | Plan template, membership tier definition |
| Membership Add-on | Plan add-on, subscription add-on |
| Property Vault | Digital home vault, asset list |
| Checklist Evidence | Inspection, assessment, form |
| Estimate | Quote, proposal |
| Change Order | Add-on estimate, revised work |
| Pipeline | Workflow board, kanban |

---

## Scheduling Truth

**Visits own scheduling. Jobs display derived visit dates.**

- `visits.scheduled_start` and `visits.scheduled_end` — source of truth.
- `jobs.scheduled_start` and `jobs.scheduled_end` — **legacy fields**. Do not
  write new features that read these as scheduling facts.
- UI should show scheduling as "Next Visit" or "Latest Visit" derived from
  the visits table, not from job-level fields.
- See `db/migrations/001_core_schema.sql` for deprecation comments on job
  scheduling columns.

---

## Pipeline Stages

Pipeline stage is always derived — never stored in the database.

**Canonical stage order (10 stages):**

| Stage key | Label | Meaning |
|---|---|---|
| `new_lead` | New Lead | Unreviewed intake or manual draft |
| `estimate_needed` | Estimate Needed | No estimate exists |
| `estimate_sent` | Estimate Sent | Estimate sent, awaiting response |
| `approved_ready` | Approved / Ready | Estimate approved, not yet scheduled |
| `scheduled` | Scheduled | Visit booked |
| `in_progress` | In Progress | Visit underway |
| `waiting` | Waiting | Blocked (parts, customer, weather) |
| `completed` | Completed | Work done, invoice not yet sent |
| `invoiced` | Invoiced / Paid | Invoice sent or paid |
| `archived` | Archived | Cancelled or closed |

---

## Aggregate Boundaries

| Aggregate | Owns |
|---|---|
| Relationship | `clients`, `properties`, `communications_log` |
| Work | `jobs`, `visits`, `estimates`, `invoices`, `expenses` |
| Membership | `maintenance_plans` (physical), add-ons, templates |
| Property History | `property_vault_items`, `document_links`, visit-derived evidence |

---

## Do Not Rules

- Do not add a `work_orders` table.
- Do not store `pipeline_stage` in the database.
- Do not write new code that reads `jobs.scheduled_start` as scheduling truth.
- Do not call memberships "maintenance plans" or "subscriptions" in product UI.
- Do not create generic inspection or workflow tables without a concrete second use case.
- Do not treat `booking_requests` as active work objects after conversion.
