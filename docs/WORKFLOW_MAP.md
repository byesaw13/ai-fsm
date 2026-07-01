# Workflow Map

This is the user-facing workflow model for Dovetails.

## Core states

1. Request
2. Walkthrough
3. Estimate
4. Approval
5. Schedule
6. Materials
7. Work
8. Change Order
9. Invoice
10. Payment
11. Closeout

## Request types

- Fixed bid: use walkthrough + estimate + approval + scheduled work.
- Time and materials: use walkthrough if needed, then work from rate card, time, materials, and invoice from actuals.

## Screen map

- `Requests` inbox: all new leads and booking requests land here.
- `Request detail`: triage, follow-up, decision, and conversion.
- `Visit`: walkthrough, measurements, photos, access notes, and field evidence.
- `Estimate`: scope, pricing, approval, and change orders.
- `Project` (`/app/jobs`): the active customer commitment that ties work orders, visits, and invoices together.
- `Work Order`: operational work packet under a project.
- `Invoice`: billing and payment collection (project-level).

## Rules

- A booking request is intake only.
- A **project** (`jobs` backend) is the active customer commitment.
- A **work order** is the executable work packet; standard visits belong to exactly one work order.
- A **visit** is the field appointment or execution event.
- An estimate is the pricing proposal.
- Assessment may seed a **draft** work order only — not an operational work order. Estimate acceptance creates the project and promotes the default work order.
- Change orders are attached to the estimate and approved separately.
- Do not show internal jargon first when a simpler customer-facing label exists. Use **Project**, not Job, in owner-facing copy.

## Architecture reference

`docs/superpowers/specs/2026-07-01-job-work-order-visit-model-design.md`