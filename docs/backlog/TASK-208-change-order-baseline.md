# TASK-208: Hourly baseline on change orders

Status:
Proposed

Epic:
EPIC-004 Billing & Profitability

Phase:
3

Problem:
Change orders are priced separately from estimates
(`apps/web/app/api/v1/change-orders/route.ts`: description, quantity and unit
price per line, no line type, no hours). The hourly baseline (TASK-188) covers
estimates only, so added work on a job is never checked against the company's
hourly rate.

Scope:
- Apply the TASK-188 baseline to change orders: person-hours with source,
  materials and equipment at cost, other direct costs, baseline low/mid/high,
  gap against the midpoint, effective rate on high-end hours against the cost
  floor. Reference only: the owner's change-order price is never changed.
- Change-order lines get a line type (labor, materials, handling_fee,
  adjustment, equipment) and hours fields.
- Same send rules: complete hours and confirmed direct costs before a change
  order goes to the customer; acknowledgment below the cost floor; assumptions
  frozen when sent.

Out of Scope:
Building this before TASK-188 ships and the owner has used it on estimates.

Acceptance Criteria:
- [ ] A change order with 4-6 h at $85/h and $200 materials shows a baseline
      of $540 / $625 / $710.
- [ ] A change order missing hours cannot be sent and lists what is missing.
- [ ] Sent change orders keep their frozen baseline when rates change.

Notes:
Split from TASK-188 on 2026-10-26 (owner decision). Depends on TASK-188 and
TASK-192.
