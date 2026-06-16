# TASK-019: Activity Timeline Correction

Status:
Done

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
- Timeline view: show the day's activities as a chronological timeline.
- Edit existing activities: start time, end time, activity type, linked job,
  notes.
- Split an activity into consecutive segments.
- Insert a missing activity between existing records.
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
- [x] Activities can be edited after completion.
- [x] Activities can be split.
- [x] Missing activities can be inserted.
- [x] Activities can be deleted.
- [x] Timeline remains chronological.
- [x] Daily totals recalculate automatically.
- [x] Mileage summaries recalculate automatically.
- [x] Audit history is preserved.

Notes:
Shipped. Date-addressable timeline editor at `/app/timeline`
(`apps/web/app/app/TimelineEditor.tsx`) with edit / split / insert / delete and a
neighbour "rebalance" offer. Correction routes mutate in place inside a
transaction and write `audit_log` (original in `old_value`, actor, timestamp,
reason in `new_value`), mirroring the vehicle-session correction precedent:
`PATCH`/`DELETE /api/v1/activities/[id]`, `POST /api/v1/activities/[id]/split`,
`POST /api/v1/activities/insert`. Pure timeline math (split/rebalance/chronology)
in `apps/web/lib/activities/timeline.ts`; shared rebalance applier in
`apps/web/lib/activities/rebalance.ts`. Daily-time and mileage summaries
recalculate automatically because they are pure derivations recomputed on load
(`summarizeDay`, `summarizeDayMileage`). No migration needed — `activity_entries`
already had UPDATE/DELETE RLS and `audit_log` captures the trail. Builds on
TASK-005.
