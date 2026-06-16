# TASK-005: Activity Tracking

Status:
Done

Problem:
There was no record of where the owner's time actually went during the day (job
work, travel, estimating, admin), so the "timesheet" had to be reconstructed by
hand.

Business Value:
A time ledger powers profitability rollups and shows how the day was really
spent, without manual timesheet entry.

Scope:
- One ledger of activity entries (start/end, category, optional entity link).
- At most one active entry at a time; corrections are void + re-add, not edits.
- The timesheet is derived from these rows, never entered by hand.

Out of Scope:
- Payroll integration.
- Multi-user time tracking.

Acceptance Criteria:
- [x] Time can be logged against categories and optionally linked to a
      job/visit/estimate.
- [x] Only one activity is active at a time.
- [x] End Day ends any still-running activity.

Notes:
Shipped. Migration `db/migrations/111_activity_entries.sql`; UI
`apps/web/app/app/ActivityTracker.tsx`; integrated into the Daily Operations Log.
