# EPIC-001: Operations & Mileage

The daily operating loop for Dovetails: starting the day, tracking which vehicle
is in use and its odometer, recording where time goes, and keeping that data
trustworthy enough to feed tax mileage, vehicle cost, and job profitability.

## Active tasks

# TASK-004: Daily Operations Log

Status:
In Progress

Problem:
The owner needs a single place to start the day, see today's jobs, track the
active vehicle session, and close out — without bouncing between screens.

Business Value:
A clear daily loop reduces missed steps (unlogged mileage, unclosed visits) and
makes end-of-day reconciliation fast.

Scope:
- Day-level command center surfacing today's jobs, materials, action queue, and
  end-of-day checks.
- Hosts the active vehicle session panel (TASK-001) and activity tracking
  (TASK-005) without conflating the day with a single vehicle.

Out of Scope:
- Replacing per-feature pages (jobs, estimates, invoices).
- Business Ledger.

Acceptance Criteria:
- [ ] One screen starts the day and shows the active vehicle session separately
      from the day.
- [ ] End-of-day surfaces open warnings (open mileage, in-progress jobs, draft
      invoices, deposits).
- [ ] Switching vehicles does not require ending the day.

Notes:
Foundation exists: `apps/web/app/app/DailyCommandCenter.tsx`,
`apps/web/app/app/page.tsx`, and `apps/web/app/api/v1/sessions/*`. Still evolving
as mileage and activity tracking mature.

## Completed

- [TASK-001: Vehicle Mileage Sessions](done/TASK-001-vehicle-mileage-sessions.md) — Done
- [TASK-002: Vehicle Session Recovery](done/TASK-002-vehicle-session-recovery.md) — Done
- [TASK-003: Wrong Vehicle Correction](done/TASK-003-wrong-vehicle-correction.md) — Done
- [TASK-005: Activity Tracking](done/TASK-005-activity-tracking.md) — Done
