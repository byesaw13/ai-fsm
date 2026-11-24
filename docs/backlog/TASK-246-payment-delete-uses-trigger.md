# TASK-246: Deleting a payment updates the invoice through the database trigger

Status:
Done

Epic:
EPIC-004 Billing & Profitability

Phase:
3

Severity:
High. Two copies of the "what is this invoice's paid total and status" rule, one in SQL and one in TypeScript, already differ.

Problem:
`sync_invoice_on_payment` (migrations 117, 164, 192) keeps `invoices.paid_cents`, `status` and `paid_at` in step with payments, but its trigger fires only on `AFTER INSERT OR UPDATE OF status ON payments`. Deleting a payment is handled by a hand copy of the rule in `app/api/v1/payments/[id]/route.ts:72-110`, whose comments say it "mirrors" 117, 164 and 192. The copies already disagree: when the last payment goes, the route sets `sent` and clears `paid_at`; the trigger keeps the old status. The next change to the trigger will not reach deletes. Audit 2026-11-24 (owner approved all findings in session).

Scope:
- New migration: `sync_invoice_on_payment` handles `DELETE` (use `OLD.invoice_id`; return the right row) and the trigger fires `AFTER INSERT OR DELETE OR UPDATE OF status`. Only a deleted `paid` payment changes the invoice; paid, void and already-deleted (cascade) invoices are left alone. (`amount_cents` updates dropped from scope: nothing in the app edits a payment amount.)
- A partial invoice with no paid money left goes back to `sent`, `paid_at` cleared. `validate_invoice_transition` did not allow `partial → sent`, so the route's own version of this rule failed with a 500; the migration allows it only when `paid_cents` becomes 0. An overdue invoice stays overdue. Paid and void invoices keep refusing deletes in the route.
- The route deletes the payment, then reads the invoice back. It no longer computes `paid_cents` or status. Remove its copy and the now-unused imports.
- Down migration restores the 192 function and trigger.

Out of scope:
- Payment editing UI. Refund handling.

Acceptance Criteria:
- [x] Deleting one of two payments leaves the invoice `partial` with the right `paid_cents`.
- [x] Deleting the only payment leaves the invoice `sent`, `paid_cents` 0, `paid_at` null.
- [x] A reopened (draft) invoice stays `draft` after a payment delete.
- [x] The route contains no `UPDATE invoices SET paid_cents`.

Test Plan:
- Integration: the three cases above against the real trigger.
- Deploy: backup first (migration), then check a production invoice with payments still shows the same paid total.

Related:
TASK-154 (reopen with payments), TASK-247.
