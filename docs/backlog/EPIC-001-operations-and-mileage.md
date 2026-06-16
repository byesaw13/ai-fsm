# EPIC-001: Operations & Mileage

The daily operating loop for Dovetails: starting the day, tracking which vehicle
is in use and its odometer, recording where time goes, and keeping that data
trustworthy enough to feed tax mileage, vehicle cost, and job profitability.

## Active tasks

# TASK-022: Smart Start Day

Status:
Proposed

Problem:
Starting the day re-asks for information the system already knows — which
vehicle, its last odometer, the last session. That is typing the owner shouldn't
have to do at 7am.

Business Value:
- Removes morning friction; the day starts in one tap.
- Fewer odometer entry errors because the last reading is pre-filled.

Scope:
- Offer a one-tap "Start Day in <vehicle> · <last mileage>" action using the
  known last vehicle, last odometer, and last session.
- Fall back to the existing flow when there is no prior context (first use, new
  vehicle).

Out of Scope:
- Multi-vehicle selection UI changes beyond the one-tap default.
- End-of-day flow (TASK-023).

Acceptance Criteria:
- [ ] Start Day presents a one-tap action prefilled with the last vehicle and
      last odometer.
- [ ] Confirming starts a session without further input.
- [ ] A clear path remains to choose a different vehicle / correct the odometer.

Notes:
Most of the data already exists (vehicle, last mileage, last session via
`apps/web/lib/mileage/sessions.ts` and the Current Vehicle panel) — this is
primarily a UX assembly task. Originated from the Daily Command Center UX review.
Embodies the Mobile First Field Rule (see backlog README).

# TASK-023: End of Day Checklist Wizard

Status:
Proposed

Problem:
Closing the day is a scatter of separate actions (close mileage, resolve
warnings, review tomorrow). A guided wizard could walk the owner through it.

Business Value:
- A single, guided close-out reduces forgotten steps and loose ends.

Scope:
- A step-through wizard that sequences the existing End Day actions.

Out of Scope:
- New end-of-day data or rules — composition of existing actions only.

Acceptance Criteria:
- [ ] A guided flow steps through the existing close-out actions.
- [ ] Each step reflects current state (mileage open, warnings, tomorrow).

Notes:
**Intentionally parked.** Do not build yet. The underlying pieces — Daily
Operations Log (TASK-004), Activity Tracking (TASK-005), and Timeline Correction
(TASK-019) — should stabilize in production first, or the wizard will be
redesigned repeatedly. Revisit only after those have been evaluated in real use.
Originated from the Daily Command Center UX review.

## Completed

- [TASK-001: Vehicle Mileage Sessions](done/TASK-001-vehicle-mileage-sessions.md) — Done
- [TASK-002: Vehicle Session Recovery](done/TASK-002-vehicle-session-recovery.md) — Done
- [TASK-003: Wrong Vehicle Correction](done/TASK-003-wrong-vehicle-correction.md) — Done
- [TASK-004: Daily Operations Log](done/TASK-004-daily-operations-log.md) — Done
- [TASK-005: Activity Tracking](done/TASK-005-activity-tracking.md) — Done
- [TASK-019: Activity Timeline Correction](done/TASK-019-activity-timeline-correction.md) — Done
- [TASK-021: Quick Activity Switching](done/TASK-021-quick-activity-switching.md) — Done
