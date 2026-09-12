# TASK-138: Night leftovers after job closeout

Status:
Proposed

Phase:
3

Problem:
If Complete is skipped or “not sure” never gets a date, money and the next day
fall on the floor. Day Review today does not list “finished, no invoice” or
“open, no next visit.”

Business Value:
Night is a safety net, not a second billing desk. Bonnie already sent does not
get asked again.

Scope:
- Add leftover rows to existing Day Review / Needs Attention (no new home):
  1. Job `completed` (or visit `closeout_kind = done`) with no non-cancelled
     invoice
  2. Job `in_progress`, last execution visit completed, no future visit
  3. Expenses dated today with `job_id` null (receipts not on a job)
- Each row: one tap to the job closeout, schedule next visit, or link receipt
- Skip jobs that already have a sent/paid invoice

Out of Scope:
- Replacing Day Review
- Auto-sending invoices at night
- GPS reconstruction / auto-attach to open project

Acceptance Criteria:
- [ ] After Bonnie send, night list does not include that job
- [ ] After Landing coming-back + tomorrow, night does not flag “no next visit”
- [ ] After coming-back + not sure, night flags the open job
- [ ] An unlinked same-day receipt appears once
- [ ] Tests on the leftover query, not only UI

Notes:
Attention already counts jobs without a next visit
(`lib/attention/load-needs-attention.ts`). Extend that reader; do not add a
parallel scorer.
