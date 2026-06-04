# Domain Model

## Canonical Objects

The primary domain model is:

```text
Client
  -> Property
      -> Estimate
      -> Job
          -> Visit
          -> Invoice
      -> History
```

These six objects are the core product vocabulary. New documentation and product work should explain behavior in terms of these objects before introducing supporting concepts.

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
- Jobs, visits, estimates, invoices, notes, media, and durable service history linked to the home.
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

## Job

A job is the business work thread that ties scope, property, visits, estimates, and invoices together.

Owns:

- Work title and scope.
- Internal lifecycle state.
- Relationship to estimates, visits, invoices, expenses, and completion records.

Does not own:

- Scheduling truth. Use visits for scheduled time.
- Durable property facts. Those belong in property history.

## Visit

A visit is a scheduled technician execution event at a property.

Owns:

- Scheduled start/end and technician assignment.
- Field status and time markers.
- Technician notes, checklists, materials, media, and completion packet.

Does not own:

- Pricing truth.
- Invoice/payment state.

## Invoice

An invoice is the collection record for completed or billable work.

Owns:

- Invoice line items and totals.
- Invoice status: draft, sent, partial, paid, overdue, void.
- Payment records.

Does not own:

- Estimate pricing logic.
- Job or visit execution state.

## Supporting Concepts

Supporting concepts may exist, but they are not primary product identity:

- Booking request: intake evidence before work is accepted.
- Property history: derived service record for a property.
- Price book: pricing support for estimates.
- Payment: invoice collection detail.
- Automation rule: notification or follow-up support.
- Membership: recurring maintenance support only; not the product center.

## Naming Rule

Do not introduce new durable nouns unless they clarify one of the canonical objects above or are explicitly documented as supporting concepts.
