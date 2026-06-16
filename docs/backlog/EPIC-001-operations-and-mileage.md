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

## Completed

- [TASK-001: Vehicle Mileage Sessions](done/TASK-001-vehicle-mileage-sessions.md) — Done
- [TASK-002: Vehicle Session Recovery](done/TASK-002-vehicle-session-recovery.md) — Done
- [TASK-003: Wrong Vehicle Correction](done/TASK-003-wrong-vehicle-correction.md) — Done
- [TASK-004: Daily Operations Log](done/TASK-004-daily-operations-log.md) — Done
- [TASK-005: Activity Tracking](done/TASK-005-activity-tracking.md) — Done
