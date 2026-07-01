# Workflow

## Canonical Flow

```text
Lead
  -> Client
  -> Property
  -> Assessment (site_visit, optional)
  -> Estimate
  -> Project (jobs)
  -> Work Order
  -> Visit
  -> Invoice
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
| Estimate | The priced scope and approval point. | Estimate |
| Project | The accepted customer commitment (backend: `jobs`). | Job |
| Work Order | Executable work packet under the project. | Work order |
| Visit | Scheduled or actual field execution. | Visit |
| Invoice | The collection record (project-level). | Invoice |
| History | The permanent property service record. | Property timeline/read model |

## Workflow Rules

- A booking request is intake evidence, not a work object.
- A property is the long-term record of what happened at a home.
- A **project** (`jobs`) ties together the customer commitment, work orders, visits, estimates, and invoices.
- A **work order** is the operational planning packet; standard visits execute under exactly one work order.
- A **visit** is scheduling and field execution truth. Operational visit types (`site_visit`, `membership_health_check`, etc.) do not use work orders.
- An estimate is the pricing proposal and guardrail surface.
- An invoice is the billing and payment record at the **project** level.
- Assessment may seed a **draft** work order for planning only. It must not create an operational work order. Operational work orders are created or promoted when the estimate is accepted.
- Pipeline or dashboard views must be derived views, not new stored workflow objects.

## Assessment → Work Order (draft only)

```text
site_visit + assessment
  -> optional draft work order (scope packet, not schedulable)
  -> estimate
  -> [accepted]
  -> project + default work order (promoted from draft or created from estimate)
  -> visit(s) under work order
```

**Removed pattern:** assessment → standalone operational work order. Do not document or build paths that skip estimate acceptance for billable execution.

## Daily Operating Loop

The Daily Command Center at `/app` is an orchestration layer over existing workflow objects, not a new workflow system. It guides the day in order: Start Day, What needs you, Today's Projects, Materials, and End Day. Each section reads from and writes to the existing modules: vehicle sessions, visits, expenses, estimates, invoices, projects, and booking requests.

The only stored addition for this loop is open vehicle-session state: a session may start with a start odometer and close later with an end odometer and computed miles. Receipts, material runs, follow-ups, tomorrow preview, and end-of-day warnings remain derived from existing records.

The deeper architecture of this loop — separating payroll, presence, activity, vehicle, and location into independent lifecycles under a flexible Business Day, with a live Current Operations State — is defined in `docs/canonical/OPERATIONS.md` (the **Operations Engine**). That doc governs how the daily loop's concerns fit together; this section stays the simple product view.

## Status Model

Detailed DB status definitions live in `docs/working/domain/workflow-model.md`. Work order planning status and visit execution status are separate layers. Use derived presentation stages for humans and stored statuses only where application logic needs operational truth.

## Current Workflow Focus

The current product focus is clarity from accepted scope through field execution and billing:

```text
Estimate approval -> Project readiness -> Work order -> Visit execution -> Invoice -> Property history
```

New work should improve this path before adding new business models or dashboard surfaces.

## Architecture reference

`docs/superpowers/specs/2026-07-01-job-work-order-visit-model-design.md`