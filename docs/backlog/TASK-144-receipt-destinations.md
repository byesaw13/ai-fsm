# TASK-144: Receipt review destinations (job / truck / stock / tools)

Status:
In Progress

Phase:
3

Problem:
Receipt review only links unlinked **materials** to **open** jobs. Closed jobs
(Landing, Bonnie) are missing from the picker. Truck, stock, and tools are not
jobs, so they cannot be filed. Dismiss does not persist.

Business Value:
Every receipt has a real destination. Closed-job cost stays on the job without
rebilling. Shop/truck buys stop clogging the queue.

Scope:
- Additive `expenses.reviewed_at` and `expenses.allocation`
  (`job` | `truck` | `stock` | `tools` | `overhead`).
- Picker: open jobs, then recently completed/invoiced (60 days) labeled closed.
  Linking to a closed job sets `job_id` only — invoices do not auto-add lines
  (already true: uninvoiced `source_expense_id` check).
- Non-job actions: Truck, Stock, Tools, Overhead (Dismiss = overhead).
- Queue: unlinked materials **or tools**, `reviewed_at IS NULL`.
- Leftover “receipts not on a job” ignores reviewed allocations.

Out of Scope:
- Fake Truck/Stock jobs
- Issuing stock to a job later (inventory decrement)
- Reopening paid invoices to add materials

Acceptance Criteria:
- [ ] Closed jobs from the last 60 days appear in the picker
- [ ] Truck / Stock / Tools / Overhead remove the row and persist
- [ ] Refresh does not bring dismissed overhead back
- [ ] Linking to an invoiced job does not create a new invoice
