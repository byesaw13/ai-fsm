# TASK-151: Per-person labor cost + estimated-vs-actual on job detail

Status:
Done

Phase:
3

Epic:
EPIC-004 Billing & Profitability (continues TASK-084 Job Ledger — estimate vs actual)

Problem:
Internal labor cost was one company constant (code+DB $50, a stale doc said $85),
and the job-detail estimate-vs-actual labor cost used a flat rate × total tracked
minutes. With more than one worker, or a worker with a different pay/burden, the
"actual" was wrong and margin could not be trusted — no calibration loop.

Business Value:
Labor cost is now a property of the worker (pay × burden), so estimate-vs-actual
and margin on the job reflect who actually did the work. As time is logged the
number becomes real, giving the owner a feedback gauge to adjust rates over time.

Scope:
- Per-person cost rate: `users.cost_cents_per_hour` + `burden_multiplier`
  (migration 189); `workerCostRateCentsPerHour()` resolves pay × burden, account
  cost clock as fallback. Shipped in PR #671.
- Route remaining estimate pricing paths through account settings. PR #672.
- Job-detail Internal P&L actual labor = Σ(worker minutes × their rate). PR #673.
- Prominent "Labor est → actual" variance headline (over=amber / under=green). PR #674.
- Demo fixture (`db/seeds/demo_job.sql`) so the headline is reproducible. PR #675.

Out of Scope:
- Full activity-based burden allocation (taxes/insurance/vehicle split).
- Surfacing the cost variance outside the owner-only Internal P&L card.

Acceptance Criteria:
- [x] Internal labor cost resolves per worker; $50 is the documented fallback.
- [x] Job-detail actual labor cost sums per-person tracked time × each worker's rate.
- [x] Estimated-vs-actual labor variance is visible on the job page with over/under color.
- [x] `db:seed` reproduces the demo (pinned $50 worker → $350 actual vs $300 est).
