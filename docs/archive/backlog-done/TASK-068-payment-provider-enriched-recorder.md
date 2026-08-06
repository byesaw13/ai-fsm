# TASK-068: Payment Provider Model & Enriched Recorder

Status:
Done

Phase:
3

Problem:
Payments are tracked but the model is thin: no payment type (deposit / progress /
final / refund / adjustment), no link to job or customer on the payment row, no
provider/external-reference fields, and a narrow method list (no Venmo, Zelle,
ACH, Square). There is also no single panel that shows total / deposit required /
paid / balance / status, and payment events are only written to `audit_log`.

Business Value:
Dovetails OS becomes the source of truth for deposits, balances, and payment
history across every channel (Venmo, cash, check, Zelle, ACH) without depending
on any payment API. This is the most-used part of the epic in the field.

Scope:
- Extend `payments` with `job_id`, `customer_id`, `status`, `payment_type`,
  `external_provider`, `external_payment_id`, `external_checkout_url`, `paid_at`.
- Expand payment methods to square / venmo / cash / check / zelle / ach / other.
- Upgrade the recorder UI with payment type and the wider method list.
- Add an invoice payment-summary panel and richer payment history.
- Write a `payment.recorded` workflow event and surface payments on the property
  timeline.

Out of Scope:
- Stripe.
- Replacing Square invoices.
- Online card processing (covered by TASK-069).

Acceptance Criteria:
- [x] A payment can be recorded as deposit / progress / final, full or partial.
- [x] Invoice balance and status update automatically.
- [x] Methods include Venmo, Zelle, ACH, cash, check, Square, other.
- [x] Invoice page shows total / deposit required / paid / balance / status.
- [x] Each payment writes a workflow event and appears on the timeline.
- [x] Manual recording works with no payment provider configured.

Notes (Wave 0a close):
Wave 0a verify 2026-08-05: PASS.
Evidence: migration 117 payment_type/methods/provider cols; RecordPaymentForm
(venmo/zelle/ach/cash/check/square); POST invoices/[id]/payments with payment_type
+ payment.recorded workflow event; PaymentHistory; manual record without provider.
