# TASK-154: Reopen and edit a partially paid invoice (T&M)

Status:
Done (#681, migration 192, deployed 2026-09-23)

Phase:
3

Epic:
EPIC-004 Billing & Profitability

Problem:
T&M invoices always change after the first payment: true materials and time
land after the deposit. The app only reopened an invoice to draft when
`paid_cents = 0` (API guard in `invoices/[id]/transition`, UI filter on the
invoice page, and `validate_invoice_transition` / `enforce_invoice_immutability`
in the DB). A deposit-paid invoice was frozen, forcing a second invoice for the
same job (2026-09-23), which reads as unprofessional to the client.

Business Value:
One invoice per job that tracks the real T&M total. The owner reopens it,
corrects labor/materials, and re-sends; the client sees one bill with their
payments credited.

Scope:
- Migration 192: reopen allowed with payments as long as `paid_cents` is
  unchanged; re-send of a reopened invoice with payments settles to
  `partial`/`paid` (not `sent`); a payment landing while reopened updates
  `paid_cents` but keeps the invoice `draft`.
- Remove the `paid_cents > 0` reopen guard in the transition API and the
  invoice page's transition filter.
- Invoice email balance = total − deposit credit − payments (was total −
  deposit, so a re-sent partial invoice would email the full total).

Out of Scope:
- Editing `paid` or `void` invoices (stay immutable).
- Refund / overpayment handling when an edit drops the total below payments
  (re-send lands on `paid`; owner handles the credit).
- Auto-crediting prior invoices on the final invoice (TASK-153).

Acceptance Criteria:
- [x] A partial invoice reopens to draft with payments intact; `sent_at` clears.
- [x] Editing then re-sending lands on `partial` (or `paid` when covered).
- [x] Reopen can never change `paid_cents`.
- [x] A payment on a reopened draft keeps it draft.
- [x] Unpaid drafts still cannot jump to `partial`.
- [x] Re-sent email shows the balance net of payments.
- [x] Integration test: `apps/web/lib/invoices/__tests__/reopen-with-payments.integration.test.ts`.
