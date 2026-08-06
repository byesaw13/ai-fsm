# TASK-067: Visit Timeline

Status:
Done

Phase:
1

Problem:
The Visit Production Rollup (TASK-066) shows totals, but not the *sequence* of a
visit — when the clock started, the arrival, the demo / material-run / install
segments, the departure. The chronological story is what makes a visit legible
after the fact.

Business Value:
A scannable timeline of a production session. High value for reconstructing
multi-day jobs and settling disputes.

Scope (thin v1 — office-hours + design/eng review 2026-08-06):
- Chronological timeline from visit lifecycle + visit-linked `activity_entries`
- Primary mount: Day Review **Production story** (always visible)
- Secondary: visit detail same panel
- Reference-only; no new timeline table

Out of Scope (v2 follow-ups):
- Payroll clock events, presence_intervals (TASK-057), travel density, job-window
  activity fallback, TASK-066 totals shell

Acceptance Criteria:
- [x] A visit renders an ordered timeline of lifecycle + activity events
- [x] Timeline derives purely from existing ledgers
- [x] Day Review shows production story per scheduled visit for the business day

Notes:
Shipped Approach A. Domain `buildVisitTimeline`, loader with visits-for-day OR
rule (scheduled|arrived|completed), batched activities, VisitTimelinePanel.
