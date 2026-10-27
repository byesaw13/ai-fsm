# TASK-190: Materials cost field, and materials booked as materials cost

Status:
Done (#724, f4837336, verified 2026-10-27)

Epic:
EPIC-002 Estimating & Assessments

Phase:
3

Parent:
TASK-188

Problem:
`apps/web/lib/estimates/create-estimate.ts` (itemized branch, `computeEstimate`
call) feeds materials lines to the engine as `materialCents` and stores the
engine's whole `estimatedCostCents` as `internal_labor_cost_cents`; nothing sets
`internal_material_cost_cents`. The engine also adds a 15% handling line that is
never billed, which inflates margin. Handling-fee lines are counted as cost;
adjustment and travel lines are treated as labor hours. Verified on
Fixture A: internal labor $6,962.50 = 110.25 h x $50 + $1,450 materials;
internal materials $0, so the AI review reported "$0 materials".

Scope:
- `unit_cost_cents` on materials and equipment lines (migration 208), separate
  from the customer price. The price defaults to the cost. A line priced above
  cost shows its markup (for example "marked up 20%") and is excluded from
  automatic handling. Handling stays a separate line. A materials or
  equipment line with no cost is a missing direct cost for the send rules.
- Every path that writes materials lines (create, PATCH, Apply to quote, the
  materials generator hand-off, convert) carries the cost.
- Itemized create: labor cost = labor lines only (line hours x cost rate when
  hours exist, else price / billing rate x cost rate); materials cost = sum of
  materials line costs; handling-fee, adjustment and travel lines are neither labor
  nor materials cost; no phantom handling in the margin.
- Margin percentage uses the same split.

Out of Scope:
Backfilling existing estimates (Apply to quote already rewrites prepared ones).

Acceptance Criteria:
- [x] Creating an estimate with Fixture A's 12 lines stores
      internal_material_cost_cents 145000 and internal_labor_cost_cents 551250.
- [x] A handling-fee line changes neither cost field.
- [x] Margin percentage has no handling revenue that is not on the quote.
- [x] A materials line with cost $200 and price $240 shows "marked up 20%",
      gets no automatic handling, and counts $200 as materials cost.
- [x] A new materials line with only a cost entered gets price = cost.
- [x] Unit tests for each line type.

Effort:
1.5 days.
