# TASK-095: Estimate vs. Actual Benchmark Runner & Production Rate Calibration Script (PI-011)

Status:
Done

Phase:
3

Problem:
There is no automated script to run completed jobs through computeEstimate(), compare estimated costs/hours against actual invoiced/logged values, and calculate systematic labor and material bias across the business.

Business Value:
Executes the 30-job benchmark protocol, producing empirical labor ratios, material ratios, signed percentage errors, and rate calibration recommendations using the safe shrinkage formula.

Scope:
- Create `scripts/run-estimate-benchmark.ts` to query completed/invoiced jobs from PostgreSQL.
- Compare estimate totals/subtotals vs invoiced totals, logged activity labor hours (`activity_entries`), and actual material costs (`job_material_lines`).
- Compute per-job and aggregate metrics: Labor Ratio ($Actual / Estimated$), Material Ratio ($Actual / Estimated$), Cost Variance ($Actual - Estimated$), Signed Percent Error.
- Output clean terminal report and JSON/markdown summary.

Out of Scope:
- Auto-writing suggested rate changes directly to database without owner review.

Acceptance Criteria:
- [x] `scripts/run-estimate-benchmark.ts` can be executed via `npx tsx scripts/run-estimate-benchmark.ts`.
- [x] Script successfully queries database jobs, estimates, invoices, and activity actuals.
- [x] Script outputs formatted benchmark report with variance ratios and shrinkage rate calibration recommendations.
- [x] Execution evidence: `docs/generated/ESTIMATE_BENCHMARK_REPORT.md` generated 2026-08-08 against live jobs (53 rows).

Notes:
Shipped with PR #589 (2026-08-08). Truth-pass 2026-08-17: script exists, ran
once against the production-shaped DB, wrote the report. Residual is **sample
quality**, not missing software — labor ratio used N=1 clean sample (0.05x
observed, shrinkage pulled to 0.842x). Re-run when more `activity_entries`
labor exists; do not treat the 2026-08-08 multipliers as policy.

TASK-098 (hybrid engine) was cancelled in PR #603. TASK-099 stays Deferred
until there is enough real data to reconcile with TASK-094.
