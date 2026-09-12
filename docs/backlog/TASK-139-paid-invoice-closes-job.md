# TASK-139: Paid invoice closes the job

Status:
In Progress

Phase:
3

Problem:
INV-0033 and INV-0034 were paid while J-2026-0049 and J-2026-0052 stayed
`in_progress`. Closing required Complete project then Mark as Invoiced — two
extra steps after the money was in. Payment does not cascade job status.

Business Value:
Paid means the job is done. The queue should empty itself.

Scope:
- When a standard/final invoice is fully paid and no sibling bill is open,
  hop the job `in_progress` → `completed` → `invoiced` without a second invoice.
- Wire payment POST, Square webhook, invoice → paid, and Complete project.
- Deposits/progress-only payments do not close the job.

Out of Scope:
- Changing invoice payment recording
- Reopening paid jobs

Acceptance Criteria:
- [x] Paid standard invoice with no open sibling closes the job to `invoiced`
- [x] Deposit-only paid does not close
- [x] Complete project on an already-paid job does not create another invoice
- [x] Landing + Bonnie paid jobs closed in production
