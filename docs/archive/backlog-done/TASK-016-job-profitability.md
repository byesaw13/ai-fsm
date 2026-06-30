# TASK-016: Job Profitability

Status:
Done

Problem:
Without combining revenue, expenses, and mileage per job, it was hard to know
which work was actually profitable.

Business Value:
Profitability per job guides pricing, job selection, and where to cut cost.

Scope:
- Roll up invoice revenue, expenses, and mileage per job into a profitability
  view.

Out of Scope:
- Labor-cost allocation from activity tracking (future refinement).

Acceptance Criteria:
- [x] A report shows revenue, expense, and mileage rolled up per job.

Notes:
Shipped. `apps/web/lib/reports/profitability.ts` and the reports surface. Will
benefit from accurate per-vehicle mileage (TASK-001) and future job-level
mileage allocation.
