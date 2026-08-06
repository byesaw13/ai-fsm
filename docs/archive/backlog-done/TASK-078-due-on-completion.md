# TASK-078: Invoices tied to an open job are due on completion (no premature past-due)

Status:
Done

Phase:
3

Problem:
Dovetails' terms are "due upon completion," but the owner invoices the whole job
up front and takes a deposit. At issue time there is no completion date, so
`dueDateUponCompletion()` defaults to **today** (`packages/domain/src/dovetails.ts`),
and the send route stamps `due_date` = the send day. A day later the invoice reads
as **past due**, "Client owes this now" shows on the remaining balance, and the
follow-up worker (`services/worker/src/invoice-followup.ts`) would email the client
overdue reminders — for money that isn't actually due until the job is finished.

Business Value:
Honest money state (a canonical product principle): the balance shows "Due on
completion" and never dun the client until the work is actually done, while the
deposit is still collected up front. Matches how the owner really bills.

Scope:
- **Data:** a new standard/final invoice tied to an open job stores `due_date =
  NULL` (not today); it is filled to the completion day when the owner marks the
  **job** complete (`jobs/[id]/transition` → completed) via the one-time null→value
  fill the immutability trigger already allows (migration 149). Deposit invoices
  (`invoice_kind = 'deposit'`) and jobless/ad-hoc invoices stay due-now. Covers the
  create, estimate→invoice convert, and send paths.
- **Display:** owner invoice page, the invoices list, and the client portal show
  "Due on completion" — not a past date, not "owes now"/"OVERDUE" — whenever the
  linked job is not complete. This fixes **existing** invoices too (their stored
  past `due_date` is immutable, so the display gates on job completion, not the
  raw date).
- **Dunning:** the follow-up worker skips invoices whose linked job is not complete.

Out of Scope:
- Net terms after completion (e.g. net-15) — completion day is the due date for
  now; a configurable net-N is a later task.
- Retroactively rewriting existing invoices' stored `due_date` (immutable by
  migration 149; the display/worker gates cover them instead).
- Separate deposit-invoice + final-invoice workflow (the owner uses one whole-job
  invoice + a deposit payment; unaffected here).

Acceptance Criteria:
- [x] A standard/final invoice created/sent for an open job has no past `due_date`
      and shows "Due on completion"; a deposit or jobless invoice is unchanged.
- [x] Marking the job complete fills the invoice's `due_date` to the completion day.
- [x] While the job is open, the owner page, list, and portal never show past-due /
      "owes now" / "OVERDUE"; the follow-up worker does not dun it.
- [x] The due-date resolution + "due on completion" predicate are pure and
      unit-tested.

Notes:
Phase 3 (Estimate & Billing Closure). Builds on `dueDateUponCompletion`
(`packages/domain/src/dovetails.ts`) and the immutability trigger (migration 149).
No new migration — `due_date` is already nullable.

Notes (Wave 0a close):
Wave 0a verify 2026-08-05: PASS.
Evidence: invoiceDueOnCompletion + resolveIssueDueDate pure + dovetails.test.ts
(8 tests pass); send/create/convert null due_date for open job; job transition
fills due_date; owner list/detail + portal "Due on completion"; worker follow-up
skips open-job standard/final balances.
