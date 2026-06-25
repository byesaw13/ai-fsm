# Workflow

## Canonical Flow

```text
Lead
  -> Client
  -> Property
  -> Estimate
  -> Job
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
| Estimate | The priced scope and approval point. | Estimate |
| Job | The accepted work thread. | Job |
| Visit | The scheduled field execution event. | Visit |
| Invoice | The collection record. | Invoice |
| History | The permanent property service record. | Property timeline/read model |

## Workflow Rules

- A booking request is intake evidence, not a work object.
- A property is the long-term record of what happened at a home.
- A job ties together the business work thread.
- A visit is the scheduling and field execution truth.
- An estimate is the pricing proposal and guardrail surface.
- An invoice is the billing and payment record.
- Pipeline or dashboard views must be derived views, not new stored workflow objects.


## Daily Operating Loop

The Daily Command Center at `/app` is an orchestration layer over existing workflow objects, not a new workflow system. It guides the day in order: Start Day, What needs you, Today's Jobs, Materials, and End Day. Each section reads from and writes to the existing modules: vehicle sessions, visits, expenses, estimates, invoices, jobs, and booking requests.

The only stored addition for this loop is open vehicle-session state: a session may start with a start odometer and close later with an end odometer and computed miles. Receipts, material runs, follow-ups, tomorrow preview, and end-of-day warnings remain derived from existing records.

The deeper architecture of this loop — separating payroll, presence, activity,
vehicle, and location into independent lifecycles under a flexible Business Day,
with a live Current Operations State — is defined in
`docs/canonical/OPERATIONS.md` (the **Operations Engine**). That doc governs how
the daily loop's concerns fit together; this section stays the simple product
view.

## Status Model

Detailed DB status definitions live in working technical references. The canonical product workflow should stay simple. Use derived presentation stages for humans and stored statuses only where application logic needs operational truth.

## Current Workflow Focus

The current product focus is clarity from accepted scope through field execution and billing:

```text
Estimate approval -> Job readiness -> Visit execution -> Invoice -> Property history
```

New work should improve this path before adding new business models or dashboard surfaces.
