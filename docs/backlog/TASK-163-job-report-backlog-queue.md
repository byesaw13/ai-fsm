# TASK-163: Past-jobs publish queue + unpublished reminder

Status:
In progress

Phase:
2

Epic:
EPIC-003 Property Intelligence

Problem:
Existing customers (Kim Tufts, Norman Boyd) have months of photographed work
that TASK-162 alone would never publish; new finished jobs can be forgotten.

Business Value:
Existing customers see value on day one; publishing becomes a habit. Design: `docs/designs/customer-home-record-job-reports.md` (approved 2026-09-24).

Scope:
- Queue of completed jobs with photos and no `portal_job_updates` row,
  newest first, each opening the TASK-162 publish page; Skip option.
- "Finished, not published" count on Needs Attention.

Acceptance Criteria:
- [ ] Queue lists only eligible jobs; published/skipped jobs drop off.
- [ ] Needs Attention count matches the queue.

Depends on: TASK-162.

Implementation notes (2026-09-25):
- Page: `/app/jobs/customer-reports`, owner/admin only. It lists finished jobs
  (completed or invoiced) with customer photos that have no published,
  withdrawn or skipped report, newest work first. Drafts stay on the list.
  Jobs whose invoice hasn't gone out yet are flagged.
- Skip: `POST /api/v1/jobs/[id]/customer-report {action:"skip"}` stores a
  'skipped' report row (migration 199). It is refused on a published report.
  Skipped jobs can still be published later.
- Needs Attention: "Customer reports to send", a Desk item. Its count uses the
  same `REPORT_QUEUE_WHERE` predicate as the page.
- The report editor links back to the list.
