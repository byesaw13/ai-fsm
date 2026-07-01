# Workflow Model — Dovetails Services LLC

> How state moves through the system. Three layers: DB statuses (frozen), sub-statuses (soft signals), and presentation states (user-facing).
> Last updated: 2026-07-01

---

## Four execution layers

Backend tables keep stable names. Owner/staff UI labels:

| Backend | UI |
|---|---|
| `jobs` | **Project** |
| `work_orders` | **Work Order** |
| `visits` | **Visit** |

```text
Project (jobs)
  └── Work Order(s)
        └── Visit(s)   [standard / punch_list only]
```

Operational visit types (`site_visit`, `membership_health_check`, `realtor_baseline`, `sales_walkthrough`) do not use work orders. See `docs/superpowers/specs/2026-07-01-job-work-order-visit-model-design.md`.

**Billing rule:** invoice and payment status stay at the project (`jobs`) level. Work order state is never driven by billing.

---

## Three-Layer Model

The system has three distinct status layers. Never conflate them.

| Layer | Purpose | Where defined | Who sees it |
|---|---|---|---|
| **DB status** | Operational truth; drives logic and RLS | DB `CHECK` constraint | Code only |
| **Sub-status** | Soft signal; adds nuance without state machine transitions | `sub_status` column (nullable) | Internal staff UI |
| **Presentation stage** | Human-readable; derived, never stored | `packages/domain/src/stages.ts` | Portal, pipeline board, client-facing |

---

## Project lifecycle (`jobs` table, UI: Project)

```
draft ──► quoted ──► scheduled ──► in_progress ──► completed ──► invoiced
  │         │
  └──────────────────────────────────────────────────────────────► cancelled
```

### DB status meanings

| Status | Meaning | Typical entry condition |
|---|---|---|
| `draft` | Intake received, not yet priced | Booking request accepted or manual creation |
| `quoted` | Estimate sent or created | At least one estimate on the project |
| `scheduled` | Work committed to calendar | Visit scheduled under a work order on the project |
| `in_progress` | Field work underway | Active visit transitions to `arrived` or `in_progress` |
| `completed` | All work done | Final visit / work order completion |
| `invoiced` | Invoice issued | Invoice created against the project |
| `cancelled` | Project abandoned | Manual or policy action |

### Project sub-statuses (soft signals)

Applied alongside any main status. Do not drive state machine transitions from sub-status.

| Sub-status | Meaning |
|---|---|
| `waiting_parts` | Project blocked pending material delivery |
| `customer_hold` | Client requested pause |
| `dispute` | Pricing or scope disagreement active |
| `quote_revision` | Estimate revision in progress |

### Scheduling truth

`jobs.scheduled_start` and `jobs.scheduled_end` are **legacy fields**. Do not read them for display or logic. Derive scheduling state from `visits.scheduled_start` instead. A project is considered "scheduled" when it has at least one visit in `scheduled` or `in_progress` status on a work order.

---

## Work Order lifecycle (planning)

Target v1 statuses (schema alignment in implementation slice 1):

```
draft ──► ready ──► scheduled ──► dispatched ──► waiting ──► completed
  │                                                      │
  └──────────────────────────────────────────────────────► cancelled
```

| Status | Meaning |
|---|---|
| `draft` | Pre-acceptance scope packet from assessment; not schedulable; no visits |
| `ready` | Estimate accepted; project exists; awaiting first visit |
| `scheduled` | At least one future standard visit on calendar (derived) |
| `dispatched` | Planning milestone: crew assigned, today's work begun (not travel) |
| `waiting` | Blocked (parts, customer hold, weather) |
| `completed` | Required completion criteria met; visits done |
| `cancelled` | Abandoned |

Reserved for a future slice (not exposed in UI yet): `approved`, `closed`.

### Assessment → draft work order (allowed)

Assessment may seed or update a **draft** work order (scope, materials, notes, completion criteria).

**Forbidden while draft:** visits, scheduling, completion, billing, property timeline as completed work.

**Forbidden entirely:** assessment → standalone **operational** work order. The assessment UI prepares a draft only; estimate acceptance promotes the work order onto a project.

### Estimate acceptance

When estimate → `approved`:

1. Create or link project (`jobs`)
2. Promote assessment draft work order to `ready`, or create default work order from estimate scope
3. Owner may split into multiple work orders from the project screen

Default pattern: one project, one work order (handyman). Multi-phase remodels: owner splits work orders manually.

---

## Visit Lifecycle (execution)

Target v1 statuses for **standard** / **punch_list** visits (schema alignment in slice 1):

```
scheduled ──► dispatched ──► traveling ──► arrived ──► in_progress ──► completed
     │              │                                                     
     └──────────────┴────────────────────────────────────────────────────► cancelled
```

Current DB may still use the legacy subset until migrated. Dispatch, travel, arrival, and active field work live **only** on visits — never on work orders.

### DB status meanings (target)

| Status | Meaning |
|---|---|
| `scheduled` | Appointment on calendar, not started |
| `dispatched` | Crew notified / assigned for this visit |
| `traveling` | Technician en route (GPS/live) |
| `arrived` | Technician checked in on site |
| `in_progress` | Active field work |
| `waiting` | Paused on site (parts, customer, weather) |
| `completed` | Visit wrapped up, completion packet available |
| `cancelled` | Visit did not happen |

### `visit_type` and `work_order_id`

| `visit_type` | `work_order_id` |
|---|---|
| `standard`, `punch_list` | **Required** |
| `site_visit`, `membership_health_check`, `realtor_baseline`, `sales_walkthrough` | **Forbidden** |

When `work_order_id` is set, `visits.job_id` must equal `work_orders.job_id`.

Technician assignment lives on the visit, not the work order. Work orders may carry `preferred_technician` or `required_trade` as planning hints only.

### Visit sub-statuses (soft signals)

| Sub-status | Meaning |
|---|---|
| `no_show` | Technician arrived but client not present |
| `weather_hold` | Outdoor work blocked by conditions |
| `waiting_parts` | Visit partially complete, waiting on materials |
| `reschedule_requested` | Client wants a new time |

### Visit → Project promotion

When a visit completes, the parent project status advances automatically:
- First completed visit → project moves to `in_progress` or `completed` (depending on visit count and project config)
- All visits complete → project moves to `completed`

Work order `scheduled` / `dispatched` / `completed` should be derived from child visit states where possible.

This is the primary automated cross-object promotion path. Do not create additional automated cross-object promotions without documenting them here.

---

## Estimate Lifecycle

```
draft ──► sent ──► approved
  │         │
  │         └──────────► declined
  │
  └──────────────────────────────► expired
```

After `approved`, change orders may be added. Approved estimates create or link a project and a default work order.

### Estimate → Project relationship

- An estimate can exist without a project (early pricing before project creation).
- An estimate linked to a project and approved → project transitions to `quoted`; default work order promoted to `ready`.
- An estimate can be linked to a vault item (sourced from a visit scope observation).
- Assessment may maintain a draft work order before acceptance; acceptance promotes it — no orphan operational work order.

---

## Invoice Lifecycle

```
draft ──► sent ──► partial ──► paid
  │         │
  │         └──────────────────────► overdue
  │
  └──────────────────────────────► void
```

Invoices do not automatically advance project status. The owner manually marks a project `invoiced` after issuing the invoice. Invoice state never drives work order status.

---

## Booking Request Lifecycle

```
new ──► reviewed ──► accepted ──► [conversion creates project + client + property]
           │
           └──────────────────► declined
```

After accepted, the booking request is read-only. All further work happens on the project.

---

## Presentation Stage (Customer-Visible)

Derived from project (`jobs`) state — never stored. Defined in `packages/domain/src/stages.ts`.

| Stage | Label | Derived from |
|---|---|---|
| `intake` | Intake | project.status = `draft` |
| `estimate` | Estimate | project.status = `quoted` + no approved estimate |
| `accepted` | Accepted | project.status = `quoted` + approved estimate + no active visit |
| `scheduled` | Scheduled | project.status = `scheduled` or `in_progress`, or `quoted` + active visit |
| `completed` | Completed | project.status = `completed`, `invoiced`, or `cancelled` |

### Portal-only stage derivation

When project records are unavailable (portal estimate-only view), stage is derived from document statuses. See `derivePortalStage()` in `packages/domain/src/stages.ts`.

---

## Membership Visit Phases

When a visit is tied to a membership plan, it has a phase:

| Phase | Purpose |
|---|---|
| `health_check` | Structured walkthrough of property systems |
| `included_action` | Up to 60 min of included repair/maintenance work |
| `reporting` | Technician documents vault items and issues |

Phase progression is driven by the technician in the field, not by system automation. The vault collection algorithm (`getVaultCollectionStep()`) tells the technician which vault categories to focus on during each visit based on the membership tier.

---

## Automation Rules

Automation rules fire on `workflow_events`. They do not directly mutate job/visit/estimate status — they send notifications, enqueue messages, or flag items for review. Rules are:

1. Defined in the `automation_rules` table
2. Triggered by events logged to `workflow_events`
3. Processed by the worker service via `notification_queue`

Automation rules are **not** state machine transitions. If you need state to change, use a transition API route.

---

## What belongs where: state decision tree

```
Q: Does this reflect operational truth that drives logic?
  → DB status (CHECK constraint)

Q: Does this add nuance to an existing status without
   triggering a formal state machine transition?
  → Sub-status (nullable text column)

Q: Is this a human-readable simplification for display?
  → Presentation stage (derived in packages/domain/src/stages.ts)

Q: Is this a business rule that fires on a state change?
  → Automation rule (automation_rules table + workflow_events)
```

---

## Status count summary (as of 2026-05-16)

| Object | DB statuses | Sub-statuses | Presentation stages |
|---|---|---|---|
| Project (`jobs`) | 7 | 4 | 5 (shared CustomerStage) |
| Work order | 7 (v1 target) | — | — |
| Visit | 8 (v1 target) | 4 | — (inherits project's stage) |
| Estimate | 5 | — | — |
| Invoice | 6 | — | — |
| Booking request | 3 | — | — |

Presentation statuses shown to clients: **5**.
