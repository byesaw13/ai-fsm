# Workflow

## Canonical Flow

```text
Lead
  -> Client
  -> Property
  -> Assessment (site_visit, optional)
  -> Quote (estimates)
  -> Job
  -> Visit
  -> Bill (invoices)
  -> History
```

The product should keep this flow visible and avoid creating parallel workflow systems.

## Step Definitions

| Step | Meaning | Primary object |
|---|---|---|
| Lead | A new inbound request or intake signal. | Booking request or draft client/property context |
| Client | The person or household relationship. | Client |
| Property | The home where work happens and history accumulates. | Property |
| Assessment | Pre-sale site visit and scope capture. | `site_visit` visit + assessment record |
| Quote | The priced scope and approval point. | Estimate |
| Job | The accepted customer commitment (backend: `jobs`). | Job |
| Visit | Scheduled or actual field execution. | Visit |
| Bill | The collection record (job-level). | Invoice |
| History | The permanent property service record. | Property timeline/read model |

## Workflow Rules

- A booking request is intake evidence, not a work object.
- A property is the long-term record of what happened at a home.
- A **job** (`jobs`) ties together the customer commitment, work orders, visits, quotes, and bills.
- A **work order** is an internal planning packet; the owner never navigates to it as a top-level noun. Standard visits execute under exactly one work order.
- A **visit** is scheduling and field execution truth. Operational visit types (`site_visit`, `membership_health_check`, etc.) do not use work orders.
- A quote (`estimates`) is the pricing proposal and guardrail surface.
- A bill (`invoices`) is the billing and payment record at the **job** level.
- Assessment may seed a **draft** work order for planning only. It must not create an operational work order. Operational work orders are created or promoted when the estimate is accepted.
- Pipeline or dashboard views must be derived views, not new stored workflow objects.

## Assessment → Work Order (draft only)

```text
site_visit + assessment
  -> optional draft work order (scope packet, not schedulable)
  -> estimate
  -> [accepted]
  -> job + default work order (promoted from draft or created from estimate)
  -> visit(s) under work order
```

**Removed pattern:** assessment → standalone operational work order. Do not document or build paths that skip estimate acceptance for billable execution.

## Daily Operating Loop

**Today** (`/app/my-work`) is the field home: start the day, confirm the house, do the job, Complete. **Desk** (`/app`) is the office home: money leaks, tomorrow, reports. They are not two copies of the same day. Needs Attention is one component with two filters — field leftovers on Today, money and office leaks on Desk.

The only stored addition for this loop is open vehicle-session state: a session may start with a start odometer and close later with an end odometer and computed miles. Receipts, material runs, follow-ups, tomorrow preview, and end-of-day warnings remain derived from existing records.

Owner promise capture (TASK-115) is evidence plus confirmation, not a second task list. Zero-context voice is stored as `capture_evidence`. Day Review confirms at most three items per session onto an `action_items` row attached to a booking request, estimate, job, or invoice. Completion lives on that `action_items` row. Desk may show a counted Customer Promises bucket; it does not gain a new briefing, inbox, or scorer.

The deeper architecture of this loop — separating payroll, presence, activity, vehicle, and location into independent lifecycles under a flexible Business Day, with a live Current Operations State — is defined in `docs/canonical/OPERATIONS.md` (the **Operations Engine**). That doc governs how the daily loop's concerns fit together; this section stays the simple product view.

## Status Model

Detailed DB status definitions live in `docs/working/domain/workflow-model.md`. Work order planning status and visit execution status are separate layers. Use derived presentation stages for humans and stored statuses only where application logic needs operational truth.

## Current Workflow Focus

The current product focus is clarity from accepted scope through field execution and billing:

```text
Quote approval -> Job readiness -> Visit execution -> Bill -> House history
```

New work should improve this path before adding new business models or dashboard surfaces.

## Architecture reference

`docs/superpowers/specs/2026-07-01-job-work-order-visit-model-design.md`