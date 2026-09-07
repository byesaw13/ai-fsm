# TASK-120: Big-job billing — deposit gate + progress (thirds) billing

Status:
Done

Phase:
3

Problem:
From a workflow review with the owner: big multi-day jobs **always** take a
deposit before work starts, but that's a manual detour today rather than a step
in the approve→start flow. And long jobs need staged billing — the owner's rule
is **jobs longer than two weeks bill in thirds (⅓ up front as the deposit, ⅓ at
the midpoint, final at completion)**. Deposits exist (TASK-071, done); explicit
progress/staged invoicing likely does not.

Business Value:
Cash flow matches how the work is actually funded — money up front on every big
job, and a middle payment on long ones so the owner isn't carrying weeks of
labor and materials before seeing a dime.

Scope:
- Make "take a deposit" a first-class step right after estimate approval (reuse
  the existing invoice deposit form + MarkDepositReceived), so starting a big job
  prompts/records the deposit rather than requiring a manual invoice.
- Add **progress billing**: for jobs over a duration threshold (default 2 weeks),
  support a ⅓ / ⅓ / final schedule — deposit, midpoint, completion — with each
  stage generating an invoice against the job total.

Out of Scope:
- Automatic detection of the 2-week threshold beyond a simple prompt/flag (owner
  can opt a job into staged billing).
- Changing how job totals or line items are computed.

Acceptance Criteria:
- [x] Approving a big estimate leads directly into recording a deposit (no manual
      standalone-invoice detour). (Deposit gate: first-class Deposit step in the
      approved handoff + "Collect a deposit before starting" as the job's next
      action; one-tap `POST /api/v1/jobs/:id/deposit-invoice`.)
- [x] A job can be billed in stages (deposit / midpoint / final), each a
      tracked invoice summing to the job total. Progress defaults to ⅓ of the
      project (clamped to remaining). Deposit amount is the estimate's
      configured deposit or the company Standard deposit % — not forced to ⅓.
      (#633, #638)
- [x] Existing single-invoice-at-completion flow still works for normal jobs.

Notes:
From the 2026-09-05 owner workflow review. Deposit primitive = TASK-071 (done).
Pairs with TASK-119 (quick-job billing) and TASK-121 (job spend view).

Shipped (#633 progress, #638 deposit gate):
- Progress billing (#633): `invoice_kind='progress'` (migration 177),
  `POST /api/v1/jobs/:id/progress-invoice` (⅓ default, clamped to remaining), and
  the final invoice credits deposit + progress via `loadCreditedInvoicesForEstimate`
  so the stages sum to exactly the project total. Equal ⅓/⅓/⅓ only happens when
  the deposit itself is one third; otherwise the deposit setting wins and the
  remainder is split across progress + final.
- Deposit gate (#638): `POST /api/v1/jobs/:id/deposit-invoice` (idempotent; amount =
  estimate deposit or company standard %); first-class Deposit step in
  `ApprovedHandoff` (collect / send / record payment); `ProjectWhatNext`
  prompts "Collect a deposit before starting" with "Schedule anyway" (prompt,
  not block). Follow-up on the same PR: real deposit payment (not a
  `deposit_paid_at` patch), clamp against existing progress invoices, ignore
  void deposits, hide Collect once a final exists.
