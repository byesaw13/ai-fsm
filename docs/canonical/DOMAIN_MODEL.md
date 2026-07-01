# Domain Model

## Canonical Objects

The primary domain model is:

```text
Client
  -> Property
      -> Estimate
      -> Job                    (UI: Project)
          -> Work Order
              -> Visit
          -> Invoice
      -> History
```

These objects form the core product vocabulary. New documentation and product work should explain behavior in terms of these objects before introducing supporting concepts.

### UI labels vs backend terms

| Backend | UI label (owner/staff) |
|---|---|
| `jobs` | **Project** |
| `work_orders` | **Work Order** |
| `visits` | **Visit** |
| `estimates` | Estimate |

Backend tables, routes, and status enums keep their stable names (`job`, `jobs`, `/app/jobs`). Presentation maps `job` → **Project** everywhere in primary navigation and owner-facing copy.

**Invoice generation and payment status stay Job-level only. Work Order state is never driven by billing.**

## Client

A client is the person or household relationship Dovetails serves.

Owns:

- Name and contact details.
- Communication preferences.
- Portal/contact access where implemented.
- One or more properties.

Does not own:

- Service history. That belongs to the property and related work records.
- Scheduling truth. That belongs to visits.
- Payment state. That belongs to invoices.

## Property

A property is the physical home or service location. This is the durable center of the product.

Owns:

- Address and location details.
- Projects, visits, estimates, invoices, notes, media, and durable service history linked to the home.
- The property timeline/read model.

Does not own:

- Client contact identity.
- Invoice payment state.
- Technician assignment state outside visits.

## Estimate

An estimate is a priced proposal for work.

Owns:

- Scope and line items.
- Pricing review and guardrail state.
- Estimate status: draft, sent, approved, declined, expired.
- Change-order or revision context where implemented.

Does not own:

- Field execution.
- Payment collection.

On acceptance, an estimate creates or links a **project** (`jobs`) and promotes a default **work order** under that project.

## Job (UI: Project)

A job is the long-lived customer commitment — the business work thread that ties scope, property, work orders, visits, estimates, and invoices together.

Owns:

- Work title and scope at the project level.
- Internal lifecycle state (`draft → quoted → scheduled → in_progress → completed → invoiced → cancelled`).
- Budget and profitability rollup.
- Relationship to estimates, work orders, visits, invoices, and expenses.
- **Invoice links and payment status** (sole billing anchor).

Does not own:

- Scheduling truth. Use visits for scheduled time.
- Dispatch, travel, GPS, or labor time. Use visits.
- Per-packet completion checklists. Use work orders.
- Durable property facts. Those belong in property history.

## Work Order

A work order is an executable packet of work under a project — operational planning for a specific scope slice.

Owns:

- Scope, rooms, tasks, and materials plan.
- Priority, preferred technician or required trade (planning hints only).
- Completion criteria (objective checklist for done).
- Work order status (planning lifecycle: draft, ready, scheduled, dispatched, waiting, completed, cancelled).
- Traceability to source assessment or estimate.

Does not own:

- Technician assignment (visits).
- Dispatch, travel, arrival, or active field work (visits).
- GPS, photos, notes, signatures (visits).
- Labor time entries (visits).
- Invoice or payment state (projects).
- Activity ledger events (visits).

A project may have one work order (typical handyman job) or many (multi-phase remodel). Each work order may have one or more standard visits.

### Draft work orders (pre-acceptance)

Assessment may seed a **draft** work order for scope planning only. Draft work orders:

- May contain scope, materials, notes, and completion criteria.
- Must not be schedulable, have visits, be completed, or be billed.
- Become operational when the estimate is accepted and the work order is attached to a project.

Assessment must not create orphan **operational** work orders. See `docs/superpowers/specs/2026-07-01-job-work-order-visit-model-design.md`.

## Visit

A visit is a scheduled or actual field execution event.

**Standard** and **punch_list** visits belong to exactly one work order (and therefore one project). Operational visit types (`site_visit`, `membership_health_check`, `realtor_baseline`, `sales_walkthrough`) do not use work orders.

Owns:

- Scheduled start/end and **technician assignment** (including multi-tech).
- Visit execution status (scheduled, dispatched, traveling, arrived, in_progress, waiting, completed, cancelled).
- Field time markers, GPS, photos, notes, customer signature.
- Materials actually used.
- Labor entries (started, stopped, breaks, travel, productive time).
- Activity ledger events (immutable operational history; future Business Ledger binds here).

Does not own:

- Pricing truth.
- Invoice/payment state.
- Project-level profitability rollup.

## Invoice

An invoice is the collection record for completed or billable work at the **project** level.

Owns:

- Invoice line items and totals.
- Invoice status: draft, sent, partial, paid, overdue, void.
- Payment records.

Does not own:

- Estimate pricing logic.
- Work order or visit execution state.

## Supporting Concepts

Supporting concepts may exist, but they are not primary product identity:

- Booking request: intake evidence before work is accepted.
- Property history: derived service record for a property.
- Price book: pricing support for estimates.
- Payment: invoice collection detail.
- Automation rule: notification or follow-up support.
- Membership: recurring maintenance support only; not the product center.
- Milestone: future layer between project and work order for large remodels (intentionally omitted from v1).

## Naming Rule

Do not introduce new durable nouns unless they clarify one of the canonical objects above or are explicitly documented as supporting concepts. A visit is never called a work order in UI copy.

## Architecture reference

Full four-layer execution model: `docs/superpowers/specs/2026-07-01-job-work-order-visit-model-design.md`