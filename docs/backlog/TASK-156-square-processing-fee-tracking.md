# TASK-156: Track Square processing fees per payment and job

Status:
Proposed

Phase:
3

Epic:
EPIC-004 Billing & Profitability

Problem:
Payments record the gross amount the client paid. Square's processing fee is
never captured (no `processing_fee` handling in
`apps/web/app/api/webhooks/square/route.ts`), so:

- The job P&L / ledger overstates what the business kept by the fee (roughly
  2–3% of every card payment; a five-figure T&M balance hides a few hundred
  dollars).
- The owner reconciles fees for taxes by hand from Square's dashboard. Fees are
  deductible, but income must be reported gross (Square's 1099-K is gross), so
  both numbers are needed.

Square's `Payment` object carries `processing_fee[]` (`ProcessingFee`:
`amount_money`, `type`, `effective_at`). It is often filled in on a later
`payment.updated` event, not on `payment.created`.

Business Value:
Honest job profit (net of card fees) and a year-end fee total for the tax
deduction, with no hand reconciliation.

Scope:
- Additive migration: `payments.processing_fee_cents integer NULL`
  (NULL = not known yet; 0 = no fee, e.g. cash).
- Square webhook: on `payment.created` / `payment.updated`, sum
  `processing_fee[].amount_money` (can include negative adjustments) and store it
  on the matching payment row. Update on every event: the value can arrive late
  or change. Idempotent; never touches `paid_cents`.
- Refunds: store the fee change Square reports on the refund (`processing_fee` on
  `PaymentRefund`) so net fee stays correct.
- Backfill: one-off script re-fetching existing Square payments
  (`getSquarePayment`) to fill `processing_fee_cents`.
- Job ledger / Internal P&L: show "Card processing fees" as a job cost line
  (sum of fees on the job's payments). Revenue stays gross.
- Reports: fee total by month/year (for the tax deduction), next to gross
  collected.
- Manual payments (cash/check/ACH/Venmo): optional fee field on Record Payment,
  default 0.

Out of Scope:
- Passing fees to clients (surcharge / discount). Owner decision 2026-09-23: no
  surcharge on Dovetails links; Square's own credit-only surcharge is used via
  Square Invoices where wanted (see TASK-155).
- Accounting-system export.

Acceptance Criteria:
- [ ] Square payment with fees → `processing_fee_cents` set from the webhook, including when fees arrive on a later `payment.updated`.
- [ ] Replayed webhook events don't double-count; `paid_cents` unchanged.
- [ ] Refund fee adjustments reflected.
- [ ] Backfill fills historical Square payments (dry-run mode first).
- [ ] Job P&L shows card fees as a cost; revenue stays gross.
- [ ] Report gives gross collected and total fees for a date range.
- [ ] Unit tests: fee summing (multiple entries, negative adjustment, missing array); integration test webhook → fee stored.
