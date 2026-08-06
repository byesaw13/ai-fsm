# TASK-071: Set a deposit on any invoice (Square-style single invoice)

Status:
Done

Phase:
3

Problem:
A deposit can only reach an invoice through the estimate → deposit-invoice →
final-invoice flow. Manually created invoices hardcode deposit_cents = 0 and the
invoice PATCH only allows deposit_paid_at, so the owner cannot make one invoice
for the full project total and collect a deposit (fixed $ or %) as a first
payment — forcing two invoices per job.

Business Value:
One invoice per job carries the full total; the owner collects a deposit up
front (via a Square payment link or a recorded cash/check payment) and the
balance on completion — like Square, with totals that line up.

Scope:
- Deposit POLICY on invoices (deposit_type none/percentage/fixed +
  percentage/fixed value), computing a requested first-payment amount from the
  current total. It does NOT touch the balance-reducing deposit_cents credit or
  the generated balance_cents column (first-payment model, not credit).
- Reuse calculateDepositPolicy; wire the existing Square "deposit" payment link
  to the computed amount; create/PATCH API; invoice-detail editor; portal + PDF
  "deposit due now" line.
- Design: docs/superpowers/specs/2026-07-20-invoice-deposit-policy-design.md.

Out of Scope:
- The estimate → deposit-invoice → final-invoice flow (unchanged).
- Creating a Square Invoice object (Square stays a card processor).

Acceptance Criteria:
- [x] A standard invoice can carry a deposit policy (none/percentage/fixed),
      off by default, editable until paid in full.
- [x] The Square deposit link charges the computed amount; the balance link
      charges total − paid; both feed paid_cents.
- [x] deposit_cents / balance_cents and the estimate deposit/final flow are
      unchanged.

Notes:
Percentage is of the full total incl. tax. Owner decisions 2026-07-20: off by
default, % of full total incl. tax, editable until paid in full.

Notes (Wave 0a close):
Wave 0a verify 2026-08-05: PASS.
Evidence: migration 154 deposit_type/percentage/fixed; InvoiceDepositForm;
resolveDepositPolicy + deposit-policy.test.ts (9 tests pass); Square link uses
first-payment deposit amount; deposit_cents credit path unchanged.
