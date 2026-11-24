# TASK-246: Deleting a payment updates the invoice through the database trigger

Status:
Proposed

Epic:
EPIC-004 Billing & Profitability

Phase:
3

Severity:
High. Two copies of the "what is this invoice's paid total and status" rule, one in SQL and one in TypeScript, already differ.

Problem:
`sync_invoice_on_payment` (migrations 117, 164, 192) keeps `invoices.paid_cents`, `status` and `paid_at` in step with payments, but its trigger fires only on `AFTER INSERT OR UPDATE OF status ON payments`. Deleting a payment is handled by a hand copy of the rule in `app/api/v1/payments/[id]/route.ts:72-110`, whose comments say it "mirrors" 117, 164 and 192. The copies already disagree: when the last payment goes, the route sets `sent` and clears `paid_at`; the trigger keeps the old status. The next change to the trigger will not reach deletes. Audit 2026-11-24 (owner approved all findings in session).

Scope:
- New migration: `sync_invoice_on_payment` handles `DELETE` (use `OLD.invoice_id` when `NEW` is null; return the right row) and the trigger fires `AFTER INSERT OR DELETE OR UPDATE OF status, amount_cents`.
- The function takes the route's rule for zero remaining payments on a non-draft invoice: status `sent`, `paid_at` cleared. Paid and void invoices keep refusing deletes in the route.
- The route deletes the payment, then reads the invoice back. It no longer computes `paid_cents` or status. Remove its copy and the now-unused imports.
- Down migration restores the 192 function and trigger.

Out of scope:
- Payment editing UI. Refund handling.

Acceptance Criteria:
- [ ] Deleting one of two payments leaves the invoice `partial` with the right `paid_cents`.
- [ ] Deleting the only payment leaves the invoice `sent`, `paid_cents` 0, `paid_at` null.
- [ ] A reopened (draft) invoice stays `draft` after a payment delete.
- [ ] The route contains no `UPDATE invoices SET paid_cents`.

Test Plan:
- Integration: the three cases above against the real trigger.
- Deploy: backup first (migration), then check a production invoice with payments still shows the same paid total.

Related:
TASK-154 (reopen with payments), TASK-247.
