# EPIC-001: Operations & Mileage

The daily operating loop for Dovetails: starting the day, tracking which vehicle
is in use and its odometer, recording where time goes, and keeping that data
trustworthy enough to feed tax mileage, vehicle cost, and job profitability.

## Active tasks

# TASK-023: Daily Command Center UX Modernization

Status:
Completed

Goal:
Redesign the Daily Command Center so it feels like the supplied mockups: clean, mobile-first, visually polished, fast to use, and organized around the technician's real workday.

Scope:
- State-driven dashboard UI (Before Day Starts, Active Day, End of Day).
- Mobile-first responsive layout matching mockup aesthetics.
- Quick activity chips for single-tap switching on the NowBar.
- Inline checklist wizard for End of Day closing.

Out of Scope:
- Business Ledger.
- New database tables.
- Core business logic changes.

Acceptance Criteria:
- [x] Dashboard has a clear state-driven layout.
- [x] Start Day is visually dominant before the day starts.
- [x] Active NowBar is visually dominant during the workday.
- [x] Quick activity chips support one-tap switching.
- [x] End Day checklist is visually dominant when closing the day.
- [x] Mobile layout resembles the clarity and polish of the supplied mockups.
- [x] Desktop layout uses sidebar + clean card grid.
- [x] Existing mileage/session/activity functionality still works.
- [x] No new untracked feature work is introduced.
- [x] pnpm gate:fast passes.

## Completed

- [TASK-001: Vehicle Mileage Sessions](done/TASK-001-vehicle-mileage-sessions.md) — Done
- [TASK-002: Vehicle Session Recovery](done/TASK-002-vehicle-session-recovery.md) — Done
- [TASK-003: Wrong Vehicle Correction](done/TASK-003-wrong-vehicle-correction.md) — Done
- [TASK-004: Daily Operations Log](done/TASK-004-daily-operations-log.md) — Done
- [TASK-005: Activity Tracking](done/TASK-005-activity-tracking.md) — Done
- [TASK-019: Activity Timeline Correction](done/TASK-019-activity-timeline-correction.md) — Done
- [TASK-021: Quick Activity Switching](done/TASK-021-quick-activity-switching.md) — Done
- [TASK-022: Smart Start Day](done/TASK-022-smart-start-day.md) — Done
