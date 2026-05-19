# Workflow Model — Dovetails Services LLC

> How state moves through the system. Three layers: DB statuses (frozen), sub-statuses (soft signals), and presentation states (user-facing).
> Last updated: 2026-05-16

---

## Three-Layer Model

The system has three distinct status layers. Never conflate them.

| Layer | Purpose | Where defined | Who sees it |
|---|---|---|---|
| **DB status** | Operational truth; drives logic and RLS | DB `CHECK` constraint | Code only |
| **Sub-status** | Soft signal; adds nuance without state machine transitions | `sub_status` column (nullable) | Internal staff UI |
| **Presentation stage** | Human-readable; derived, never stored | `packages/domain/src/stages.ts` | Portal, pipeline board, client-facing |

---

## Job Lifecycle

```
draft ──► quoted ──► scheduled ──► in_progress ──► completed ──► invoiced
  │         │
  └──────────────────────────────────────────────────────────────► cancelled
```

### DB status meanings

| Status | Meaning | Typical entry condition |
|---|---|---|
| `draft` | Intake received, not yet priced | Booking request accepted or manual creation |
| `quoted` | Estimate sent or created | At least one estimate on the job |
| `scheduled` | Work committed to calendar | Visit scheduled under the job |
| `in_progress` | Technician on site | Active visit transitions to `arrived` or `in_progress` |
| `completed` | All work done | Final visit completed |
| `invoiced` | Invoice issued | Invoice created against the job |
| `cancelled` | Job abandoned | Manual or policy action |

### Job sub-statuses (soft signals)

Applied alongside any main status. Do not drive state machine transitions from sub-status.

| Sub-status | Meaning |
|---|---|
| `waiting_parts` | Job blocked pending material delivery |
| `customer_hold` | Client requested pause |
| `dispute` | Pricing or scope disagreement active |
| `quote_revision` | Estimate revision in progress |

### Scheduling truth

`jobs.scheduled_start` and `jobs.scheduled_end` are **legacy fields**. Do not read them for display or logic. Derive scheduling state from `visits.scheduled_start` instead. A job is considered "scheduled" when it has at least one visit in `scheduled` or `in_progress` status.

---

## Visit Lifecycle

```
scheduled ──► arrived ──► in_progress ──► completed
     │                                         
     └──────────────────────────────────────► cancelled
```

### DB status meanings

| Status | Meaning |
|---|---|
| `scheduled` | Appointment on calendar, not started |
| `arrived` | Technician checked in on site ("On My Way" sent) |
| `in_progress` | Active field work |
| `completed` | Visit wrapped up, completion packet available |
| `cancelled` | Visit did not happen |

### Visit sub-statuses (soft signals)

| Sub-status | Meaning |
|---|---|
| `no_show` | Technician arrived but client not present |
| `weather_hold` | Outdoor work blocked by conditions |
| `waiting_parts` | Visit partially complete, waiting on materials |
| `reschedule_requested` | Client wants a new time |

### Visit → Job promotion

When a visit completes, the parent job status advances automatically:
- First completed visit → job moves to `in_progress` or `completed` (depending on visit count and job config)
- All visits complete → job moves to `completed`

This is the only automated status promotion path. Do not create additional automated cross-object promotions without documenting them here.

---

## Estimate Lifecycle

```
draft ──► sent ──► approved
  │         │
  │         └──────────► declined
  │
  └──────────────────────────────► expired
```

After `approved`, change orders may be added. Approved estimates convert to jobs (if not already linked) and trigger job status changes.

### Estimate → Job relationship

- An estimate can exist without a job (early pricing before job creation).
- An estimate linked to a job and approved → job transitions to `quoted`.
- An estimate can be linked to a vault item (sourced from a visit scope observation).

---

## Invoice Lifecycle

```
draft ──► sent ──► partial ──► paid
  │         │
  │         └──────────────────────► overdue
  │
  └──────────────────────────────► void
```

Invoices do not automatically advance job status. The owner manually marks a job `invoiced` after issuing the invoice.

---

## Booking Request Lifecycle

```
new ──► reviewed ──► accepted ──► [conversion creates job + client + property]
           │
           └──────────────────► declined
```

After accepted, the booking request is read-only. All further work happens on the job.

---

## Presentation Stage (Customer-Visible)

Derived from job state — never stored. Defined in `packages/domain/src/stages.ts`.

| Stage | Label | Derived from |
|---|---|---|
| `intake` | Intake | job.status = `draft` |
| `estimate` | Estimate | job.status = `quoted` + no approved estimate |
| `accepted` | Accepted | job.status = `quoted` + approved estimate + no active visit |
| `scheduled` | Scheduled | job.status = `scheduled` or `in_progress`, or `quoted` + active visit |
| `completed` | Completed | job.status = `completed`, `invoiced`, or `cancelled` |

### Portal-only stage derivation

When job records are unavailable (portal estimate-only view), stage is derived from document statuses. See `derivePortalStage()` in `packages/domain/src/stages.ts`.

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
| Job | 7 | 4 | 5 (shared CustomerStage) |
| Visit | 5 | 4 | — (inherits job's stage) |
| Estimate | 5 | — | — |
| Invoice | 6 | — | — |
| Booking request | 3 | — | — |

Total internal statuses: 30 across 5 objects. Presentation statuses shown to clients: **5**.
