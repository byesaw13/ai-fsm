# TASK-163: Past-jobs publish queue + unpublished reminder

Status:
Proposed

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
