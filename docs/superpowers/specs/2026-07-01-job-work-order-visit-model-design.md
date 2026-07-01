# Job → Work Order → Visit Model — Design Spec

**Date:** 2026-07-01  
**Status:** Approved  
**Epic:** Domain architecture (TASK-018 follow-on, Production Intelligence alignment)  
**Backlog tasks addressed:** TASK-018 (reposition), future WO/visit slices TBD

---

## Goal

Establish a stable four-layer execution model for Dovetails OS so each entity has a single purpose:

| Layer | Backend | UI label | Answers |
|---|---|---|---|
| Sales | `estimates` | Estimate | What was sold? |
| Commitment | `jobs` | **Project** | What is the customer's overall job? |
| Planning | `work_orders` | Work Order | What work packet is being executed? |
| Field reality | `visits` | Visit | What actually happened on site? |

**Invoice generation and payment status stay Job-level only. Work Order state is never driven by billing.**

Operations ≠ Accounting. Never let accounting drive operations.

---

## Canonical hierarchy

```text
Lead
  │
  ▼
Assessment (site_visit)
  │
  ▼
Estimate
  │
Accepted
  │
  ▼
Project (jobs)
  │
  ├──────────────────┐
  ▼                  ▼
Work Order       Work Order
  │                  │
  ▼                  ▼
Visit(s)         Visit(s)
  │                  │
  ▼                  ▼
Labor entries    Labor entries
  │                  │
  ▼                  ▼
Activity Ledger (visit-scoped; future Business Ledger)
```

### UI tree (owner-facing)

```text
Projects
  ├── Work Orders
  │      └── Visits
  │             └── Labor entries
  └── Invoices
```

Backend table names stay stable (`jobs`, `work_orders`, `visits`). Presentation layer maps `jobs` → **Project** everywhere in owner/staff UI.

### Vocabulary rules

| Backend | UI label | Notes |
|---|---|---|
| `jobs` | **Project** | Never show "Job" to owners in primary navigation |
| `work_orders` | Work Order | Operational work packet |
| `visits` | Visit | Field execution event |
| `estimates` | Estimate | Sales document |

- Remove `"Work Order"` from the `visit` UI alias list in `vocabulary.ts`. A visit is never called a work order.
- `job` may remain in code, APIs, and migrations. UI adapters map to Project.

---

## Entity responsibilities

### Project (`jobs`)

The long-lived customer commitment. Does not care about daily dispatch.

**Owns:**

- Customer and property
- Overall status (`draft → quoted → scheduled → in_progress → completed → invoiced → cancelled`)
- Budget and profitability rollup
- Estimate links
- **Invoice links and payment status** (sole billing anchor)
- All work orders under the project
- Photos and files at project level

**Does not own:**

- Scheduling truth (visits)
- Dispatch, travel, GPS, labor time (visits)
- Per-packet completion checklists (work orders)

### Work Order (`work_orders`)

An executable packet of work — "what is happening today" at the planning level.

**Owns:**

- Scope, rooms, tasks
- Materials plan (planned quantities/costs)
- Priority
- **Preferred technician** or **required trade** (planning hints only — not assignment)
- Checklist / **completion criteria** (objective conditions for done)
- Dependencies between work orders (future)
- Work order status (planning lifecycle)
- `source_visit_id` / `source_assessment_id` traceability

**Does not own:**

- Technician assignment (visits)
- Dispatch, travel, arrival, active field work (visits)
- GPS, photos, notes, signatures (visits)
- Labor time entries (visits)
- Invoice or payment state (projects)
- Activity ledger events (visits)

### Visit (`visits`)

Scheduled or actual field execution for a work order (standard/punch_list) or standalone operational activity (assessment, membership, etc.).

**Owns:**

- Scheduled start/end
- **Technician assignment** (one or more techs per visit — e.g. Nick + Winston on visit 2)
- Visit execution status (dispatch, travel, arrival, active work)
- GPS and location evidence
- Photos, notes, customer signature
- Materials **actually used**
- **Labor entries** (started, stopped, breaks, travel, productive time, helper time)
- Activity ledger events (immutable operational history; future Business Ledger binds here)

**Does not own:**

- Pricing truth (estimates)
- Invoice/payment state (projects)
- Project-level profitability rollup

### Profitability chain (target)

```text
Project profitability
  ← rollup from Work Orders
      ← rollup from Visits
          ← Labor entries + materials actually used + expenses
```

---

## Work Order lifecycle (v1)

**DB statuses:** `draft`, `ready`, `scheduled`, `dispatched`, `waiting`, `completed`, `cancelled`

| Status | Meaning | Enforced by |
|---|---|---|
| `draft` | Pre-acceptance scope packet | Assessment seeding only; no visits; not schedulable |
| `ready` | Estimate accepted; project exists; awaiting schedule | Requires `job_id`; no visits |
| `scheduled` | At least one future standard visit on calendar | Derived on visit create/update |
| `dispatched` | Crew assigned; today's work has begun (planning milestone) | Set when first visit of the day moves to `dispatched` — **not** a travel state |
| `waiting` | Blocked (parts, customer hold, weather) | Manual or sub-status |
| `completed` | All required completion criteria satisfied | Derived from checklist + visit rollup |
| `cancelled` | Abandoned | Manual |

**Reserved for future slice (enum slot, not exposed in UI):** `approved`, `closed`

### Dispatch: Work Order vs Visit

| Layer | State | Meaning |
|---|---|---|
| Visit | `traveling` | Technician is en route (GPS/live) |
| Work Order | `dispatched` | Planning milestone: crew assigned, work for this packet has started today |

Work order `dispatched` is not a travel state. Visit `traveling` is.

### Derived presentation (not stored DB status)

When child visits are active but the work order is not complete, UI may show **"In Progress"** as a derived label even if DB status is `scheduled`, `dispatched`, or `waiting`. This is a read-model projection, not a stored enum value.

### Completion criteria (required for v1)

Work order completion must not rely solely on owner confirmation. Each work order carries explicit **completion criteria** — a checklist of objective conditions.

**Examples:**

- □ Vanity installed
- □ Faucet connected
- □ Sink drains tested
- □ Caulk complete
- □ Photos taken
- □ Customer walkthrough done

**Rules:**

- Criteria are defined at work order creation (seeded from assessment/estimate scope) and editable while not `completed`.
- Work order transitions to `completed` when all **required** criteria are checked AND all child standard visits are `completed` (or explicitly waived with reason).
- Optional criteria may exist but do not block completion.
- Checklist state is persisted on the work order (JSONB `completion_criteria` or normalized child table — implementation plan chooses).

---

## Visit rules (`visit_type` + `work_order_id`)

Single `visits` table with database-level CHECK constraints.

### Constraint rules

1. `standard` and `punch_list` visits **must** have `work_order_id`.
2. Operational/pre-sale visit types **must not** have `work_order_id`.
3. `work_order_id` references `work_orders.id`.
4. When `work_order_id` is present, `visits.job_id` must equal `work_orders.job_id`.
5. UI routes remain separated by visit type — no generic mixed-purpose visit creation screen.

### Visit type matrix

| `visit_type` | `work_order_id` | Purpose |
|---|---|---|
| `standard` | **Required** | Billable project execution |
| `punch_list` | **Required** | Return-trip fix work on a project |
| `site_visit` | **Forbidden** | Pre-sale assessment |
| `membership_health_check` | **Forbidden** | Membership walkthrough |
| `realtor_baseline` | **Forbidden** | Realtor baseline visit |
| `sales_walkthrough` | **Forbidden** | Sales tour (new type) |

### Visit execution statuses (v1)

`scheduled`, `dispatched`, `traveling`, `arrived`, `in_progress`, `waiting`, `completed`, `cancelled`

Dispatch, travel, arrival, and active field work live **only** on visits.

### Technician assignment

- **Visits** own technician assignment (including multi-tech: primary + helpers).
- **Work orders** may specify `preferred_technician_id` or `required_trade` as planning hints only.
- Scheduling UI uses hints as defaults when creating a visit; the visit record is the source of truth.

Example — Bathroom remodel, work order "Install Vanity":

| Visit | Assigned |
|---|---|
| Visit 1 — deliver vanity | Nick |
| Visit 2 — install vanity | Nick + Winston |
| Visit 3 — adjust drawers | Subcontractor |

### Labor (visit-scoped, v1 schema reservation)

Visits own labor as first-class data. Target shape:

- Started / stopped timestamps
- Breaks
- Travel time vs productive time
- Helper time attribution

Implementation may ship as visit-scoped labor entries in a follow-on slice, but the **architectural rule** is fixed now: labor never rolls up from work orders or projects without passing through visits.

---

## Assessment → draft Work Order (pre-sale only)

Assessment may seed a **draft** work order for planning. It cannot become operational until estimate acceptance.

**Draft work order may contain:**

- Scope, rooms, tasks
- Materials plan
- Notes, photos, assumptions
- Completion criteria (draft checklist)

**Draft work order must not:**

- Be schedulable
- Have visits
- Appear as active field work
- Be completed or billed
- Appear on property timeline as completed work

**On estimate acceptance:**

1. Create project (`jobs`) if none exists
2. Promote draft work order: `draft` → `ready`, attach `job_id`
3. Or create default work order from accepted estimate scope if no draft exists
4. Owner may split default work order into multiple work orders from the project screen

**Remove:** any path that creates an orphan standalone **operational** work order directly from an assessment. The assessment UI button becomes "Prepare Work Order Draft" (or equivalent), not "Create Work Order."

---

## Estimate acceptance flow

When estimate status → `approved`:

1. Create or link **project** with client, property, title from estimate
2. Find assessment-linked draft work order for this estimate, or create default work order from estimate line items / `AssessmentSummary`
3. Promote work order: `draft` → `ready`, set `job_id`, link `source_estimate_id`
4. Seed completion criteria from estimate line items or assessment work items
5. Project status follows existing job lifecycle rules (`quoted` / `scheduled`)

**Default pattern (handyman):** one project, one work order containing full accepted scope. Owner splits for multi-phase remodels.

---

## Work order status derivation from visits

- **scheduled:** at least one child visit with `scheduled_start` in the future
- **dispatched:** at least one child visit has reached `dispatched` or beyond today, and work order is not `completed` or `cancelled`
- **completed:** all required completion criteria checked AND all required standard visits `completed` (derivation + owner waiver rules in implementation plan)
- Derivation runs on visit status transitions; manual override of derived states is not the primary source of truth

---

## Activity ledger

Ledger events belong to **visits**, not work orders.

A visit generates ledger events: travel started, arrived, labor performed, materials purchased, work completed. Work orders organize work; projects measure overall progress; visits are the immutable operational event anchor.

Business Ledger table implementation is out of scope for v1 but this binding is architectural law.

---

## Milestones (intentionally omitted from v1)

For large remodels, a future **Milestone** layer may sit between Project and Work Order:

```text
Project
  └── Milestone (e.g. Demo, Cabinets, Electrical, Paint, Finish)
        └── Work Order(s)
              └── Visit(s)
```

**Not built in v1.** Schema and APIs should not preclude adding `milestones` later, but no milestone tables, routes, or UI in the initial implementation slices.

---

## Schema changes (summary)

### `visits`

- Add `work_order_id UUID REFERENCES work_orders(id)` (nullable at column level; required by CHECK for `standard` / `punch_list`)
- Expand `status` CHECK for execution statuses
- Expand `visit_type` CHECK to include `sales_walkthrough`
- Add visit-type / work-order-id mutual exclusion CHECK
- Add `visits.job_id = work_orders.job_id` consistency CHECK (trigger or constraint)

### `work_orders`

- Expand `status` CHECK: `draft`, `ready`, `scheduled`, `dispatched`, `waiting`, `completed`, `cancelled` (+ reserved `approved`, `closed`)
- `job_id` required when `status <> 'draft'`
- Add `preferred_technician_id` (nullable FK) and/or `required_trade` (text)
- Add `completion_criteria` (JSONB or child table)
- Add `source_estimate_id` FK (nullable)
- Remove any concept of `assigned_technician_id` as execution truth

### `jobs`

- No rename. Presentation maps to Project.

---

## Data migration / backfill

| Existing data | Action |
|---|---|
| `work_orders` with `job_id` + `completed` | Keep; link standard visits via backfill `work_order_id` where possible |
| `work_orders` without `job_id` | Attach to estimate's project, or remain `draft` pending owner review |
| `standard` visits without `work_order_id` | Create default work order per project; link visits |
| Property timeline `work_order` events | Unchanged for historical rows; new rows require `property_id` + `job_id` |
| Assessment → operational work order orphans | Downgrade to `draft` or attach to in-flight estimate context |

---

## Implementation slices (phased rollout)

| Slice | Delivers |
|---|---|
| **0 — Canon** | This spec; update `DOMAIN_MODEL.md`, `workflow-model.md`, `vocabulary.ts` — **shipped 2026-07-01** |
| **1 — Schema** | `visits.work_order_id`, status/type CHECK constraints, work order status expansion, completion criteria column |
| **2 — Estimate accept** | Accept → project + default work order; promote assessment draft |
| **3 — Visit linkage** | Standard visits require work order; derived work order status; technician on visit only |
| **4 — Assessment guardrails** | Draft-only work order from assessment; remove orphan operational path |
| **5 — Project hub UI** | Project screen: work orders, split, schedule visits, completion criteria editor |

Each slice is independently deployable and testable. No big-bang migration.

---

## Out of scope (v1)

- `approved` / `closed` work order states and QC/admin locking
- Milestone entity and UI
- Business Ledger table (visit binding rule is set; implementation deferred)
- Auto-split estimate lines into N work orders on acceptance
- Subcontractor entity (visits may reference external assignees later)
- Invoice line ↔ work order attribution
- Work-order-driven billing or payment status

---

## Testing expectations

- DB constraint tests: `visit_type` ↔ `work_order_id` rules; job/work-order consistency
- Estimate accept → project + default work order promotion
- Draft work order cannot receive visits (API + DB)
- Derived work order status from visit transitions
- Completion criteria gate `completed` transition
- Vocabulary: UI never labels `jobs` as "Job" in owner navigation; visits never labeled "Work Order"
- Regression: operational visit types (`site_visit`, `membership_health_check`) unaffected

---

## Decision log

| Decision | Choice | Rationale |
|---|---|---|
| Project entity | `jobs` backend, **Project** UI | Avoid "ten Jobs" confusion; no migration rename |
| Work order per project | Default 1 on estimate accept; owner splits | Handyman-first; remodel-capable |
| Visit ↔ work order | Required for `standard` / `punch_list` | Four-layer model is real, not advisory |
| Non-job visits | `visit_type` CHECK on same table | Preserves timeline/scheduling/MCP queries |
| WO vs visit status | Split planning vs execution | One WO, many visits at different execution stages |
| WO statuses v1 | 7 states incl. `dispatched` | `approved`/`closed` deferred until enforceable |
| Assessment handoff | Draft WO only until accept | Scope assembly without bypassing sales flow |
| Technician | Visit owns assignment; WO owns preference/trade | Multi-tech and subs per visit |
| Completion | Objective criteria checklist | Enables AI + consistent done semantics |
| Labor | Visit-scoped entries | Profitability chain integrity |
| Billing | Project-level only | Operations ≠ accounting |
| Milestones | Omitted v1, documented for future | Large remodel path without overbuilding now |