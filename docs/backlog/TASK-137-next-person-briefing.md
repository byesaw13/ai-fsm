# TASK-137: Next-person briefing on the next visit

Status:
Proposed

Phase:
3

Problem:
Nothing on My Day or the next visit tells Tim what Nick did yesterday, what the
job has already finished, or what to do first. That costs ~30 minutes of walking
the house.

Business Value:
The covering tech starts on the named next step.

Scope:
- One card on the **next scheduled visit** (visit page + My Day hero when that
  visit is current):
  - Yesterday: previous completed visit’s `tech_notes` + who was assigned
  - On this job so far: prior completed visits’ notes, oldest first
  - First up: open/remainder tasks on this visit
  - When: this visit’s `scheduled_start`
- Compose only. No new table, inbox, or “handoff” noun (TASK-115).
- Empty notes: show “No day log from last visit” — do not generate fake work.

Out of Scope:
- Writing the notes (TASK-135)
- Tim’s own login / dispatch
- Property vault / realtor / membership

Acceptance Criteria:
- [ ] After TASK-135 tomorrow-visit, opening that visit shows yesterday’s note
      and the first-up task
- [ ] My Day, when that visit is the current hero, shows the same first-up line
- [ ] A job with no prior `tech_notes` still shows the card without inventing text
- [ ] Unit test: card model from visits + tasks (no UI flake)

Notes:
Data is already on `visits.tech_notes`, `work_order_tasks` / `visit_tasks`,
`assigned_user_id`. Visit property context is adjacent but is house history, not
this job’s day log — do not replace that card; add this one for the engagement.
