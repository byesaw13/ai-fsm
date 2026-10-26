# TASK-190: Book materials as materials cost when an estimate is created

Status:
Proposed

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
- Itemized create: labor cost = labor lines only (line hours x cost rate when
  hours exist, else price / billing rate x cost rate); materials cost = sum of
  materials lines; handling-fee, adjustment and travel lines are neither labor
  nor materials cost; no phantom handling in the margin.
- Margin percentage uses the same split.

Out of Scope:
Backfilling existing estimates (Apply to quote already rewrites prepared ones).

Acceptance Criteria:
- [ ] Creating an estimate with Fixture A's 12 lines stores
      internal_material_cost_cents 145000 and internal_labor_cost_cents 551250.
- [ ] A handling-fee line changes neither cost field.
- [ ] Margin percentage has no handling revenue that is not on the quote.
- [ ] Unit tests for each line type.

Effort:
0.5 day.
