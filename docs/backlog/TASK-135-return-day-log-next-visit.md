# TASK-135: Coming back — today’s work, next visit, first-up

Status:
Proposed

Phase:
3

Problem:
If the job stays open, Complete writes nothing about the day and does not plant
the next visit. Tim covering Nick has to walk the house.

Business Value:
The day log and the next start time exist before you drive away. The covering
tech reads them instead of discovering the job.

Scope:
- On Complete + **coming back**, require:
  1. What did you do today → `visits.tech_notes` (text; OS dictation is enough)
  2. When are you back → Tomorrow / pick a day / not sure
  3. What’s first when you get here → open/remainder `work_order_tasks` planned
     onto the next visit (`task_ids` on `POST /api/v1/jobs/:id/visits`)
- Tomorrow uses `buildNextScheduleDayPrefill` (same start/duration/assignee/WO).
- Not sure: no visit created; attention already has “jobs without next visit.”
- Do not add a handoff table or a second inbox (TASK-115).

Out of Scope:
- Done / invoice path (TASK-136)
- Briefing layout (TASK-137) — this task only writes the data
- Promise capture / owner voice memos

Acceptance Criteria:
- [ ] Coming back with empty “what did you do today” cannot complete
- [ ] Coming back + Tomorrow creates a scheduled visit on this job for the next
      calendar day, same WO, same assignee
- [ ] First-up appears as an open task on that next visit
- [ ] Coming back + Not sure creates no visit; job stays `in_progress`
- [ ] `tech_notes` from this step is what TASK-136 uses for labor copy if the
      job is later marked done
- [ ] Tests: prefill tomorrow; refuse empty notes; not-sure creates zero visits

Notes:
Reuse `POST /api/v1/jobs/:id/visits` and `lib/jobs/next-schedule-day.ts`.
Partial-task remainder already exists in `lib/work-orders/job-tasks.ts`.
