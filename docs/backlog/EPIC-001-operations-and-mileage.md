# EPIC-001: Operations & Mileage

The daily operating loop for Dovetails: starting the day, tracking which vehicle
is in use and its odometer, recording where time goes, and keeping that data
trustworthy enough to feed tax mileage, vehicle cost, and job profitability.

## Active tasks

# TASK-019: Activity Timeline Correction

Status:
Proposed

Problem:
Users frequently forget to start, stop, or switch activities during the day, so
the recorded timeline does not match what actually happened. Common cases:
travel left running while working; forgot to record a tool pickup; forgot to
switch vehicles; forgot to start job work; wrong activity selected; a missing
activity block. Mistakes are often noticed only at the end of the day. Today the
system treats activities as a fixed Start → End sequence, so daily reports drift
out of reality and are hard to fix.

Business Value:
- More accurate job costing.
- Better mileage records.
- Better labor tracking.
- Better daily reporting.
- Lower user frustration.
- Supports real-world field conditions (corrections remembered after the day).

Scope:
- Timeline view: show the day's activities as a chronological timeline
  (e.g. 7:00 Travel → 8:00 Job Work → 10:00 Tool Run → 10:30 Travel → 11:00 Job
  Work → 4:00 Travel Home).
- Edit existing activities: start time, end time, activity type, linked job,
  notes.
- Split an activity into consecutive segments (e.g. one Travel 7:00–12:00 block
  into Travel 7:00–8:00, Job Work 8:00–11:00, Travel 11:00–12:00).
- Insert a missing activity between existing records (e.g. Tool Rental
  10:00–10:30).
- Delete accidental entries.
- Automatic time rebalancing: when inserting/modifying, offer to adjust the
  surrounding activities so the timeline stays consistent.
- Audit trail: original activity, modified-by, timestamp, reason.

Out of Scope:
- Payroll.
- Customer billing automation.
- Business Ledger.
- AI reconstruction.

Acceptance Criteria:
- [ ] Activities can be edited after completion.
- [ ] Activities can be split.
- [ ] Missing activities can be inserted.
- [ ] Activities can be deleted.
- [ ] Timeline remains chronological.
- [ ] Daily totals recalculate automatically.
- [ ] Mileage summaries recalculate automatically.
- [ ] Audit history is preserved.

Notes:
Treat the activity timeline as a reconstructable record, not an immutable
sequence — field technicians often remember corrections after the workday ends.

Builds on TASK-005 (`activity_entries`, `db/migrations/111_activity_entries.sql`).
That model currently corrects via void + re-add rather than in-place edits; this
task extends it to richer timeline editing (edit/split/insert/delete) while
preserving an audit trail, so the implementation must reconcile the two
approaches. Mileage recalculation should reuse `summarizeDayMileage`
(`apps/web/lib/mileage/sessions.ts`); the End Day day-time/mileage summaries
already render the derived totals.

Priority: ranked above TASK-017 (Lead Source / Referral ROI). Bad activity data
corrupts mileage, profitability, job costing, utilization, and reporting, whereas
Referral ROI only affects business analytics.

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
- [TASK-021: Quick Activity Switching](done/TASK-021-quick-activity-switching.md) — Done
