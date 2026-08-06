# EPIC-004: Billing & Profitability

Closing the loop from completed work to invoice, payment, and an honest picture
of what each job actually earned.

## Active tasks

# TASK-069: Square Card Payments

Status:
Proposed

Phase:
3

Problem:
Customers want to pay by card online, but Dovetails OS has no way to create a
hosted payment link or to learn when an online payment completes.

Business Value:
Faster collection on deposits and balances via a shareable Square checkout link,
while Dovetails OS stays the source of truth for the invoice and payment record.

Scope:
- Owner-only Square settings (environment, location/application IDs, access
  token, webhook signature key) stored encrypted server-side, with a connection
  test and connected/disconnected status.
- Invoice action to create a Square payment link for deposit / balance / custom
  amount; save the link + external IDs; mark the payment `pending`.
- `POST /api/webhooks/square` handling `payment.created` / `payment.updated`
  with signature verification and idempotent processing; match to the local
  payment/invoice and mark paid.
- Provider abstraction so Stripe / PayPal can be added later.

Out of Scope:
- Stripe.
- Replacing Square invoices.

Acceptance Criteria:
- [ ] Square secrets are stored server-side only, owner-only, and testable.
- [ ] A payment link can be created for deposit, balance, or custom amount.
- [ ] The webhook verifies signatures and ignores duplicate events.
- [ ] A completed Square payment marks the invoice partially/fully paid.
- [ ] Square can be disabled without breaking manual recording.

Notes:
Square is the chosen card processor. The pre-existing Stripe integration (portal
PaymentElement flow, `/api/webhooks/stripe`, `lib/stripe.ts`, stripe-cli
forwarder, Stripe env vars) was **archived/removed** in favour of Square; the
client portal "Pay online" button now redirects to a Square-hosted checkout
link. The `invoices.stripe_payment_intent_id` column is left in place as inert
historical data. Stripe can be reintroduced later via the `lib/integrations`
provider abstraction if needed.

Follow-ups landed: the webhook now also handles Square-initiated refunds
(`refund.created`/`refund.updated` → ledger-only `refunded` rows); unit tests
cover the provider module, settings route (secrets never leak), webhook
(payment completion, idempotency, refunds), and payment-link route; setup
runbook at `docs/working/square-payments-runbook.md`. The acceptance boxes
remain unchecked pending live sandbox/production verification with real Square
credentials.

## Completed

- [TASK-017: Lead Source / Referral ROI](../archive/backlog-done/TASK-017-lead-source-referral-roi.md) — Done (Wave 4 2026-08-05)

- [TASK-078: Due on completion (open job)](../archive/backlog-done/TASK-078-due-on-completion.md) — Done (Wave 0a 2026-08-05)

- [TASK-071: Set a deposit on any invoice](../archive/backlog-done/TASK-071-invoice-deposit-policy.md) — Done (Wave 0a 2026-08-05)

- [TASK-068: Payment Provider Model & Enriched Recorder](../archive/backlog-done/TASK-068-payment-provider-enriched-recorder.md) — Done (Wave 0a 2026-08-05)

- [TASK-014: Invoice Generation from Visits](../archive/backlog-done/TASK-014-invoice-generation-from-visits.md) — Done
- [TASK-015: Payment Tracking](../archive/backlog-done/TASK-015-payment-tracking.md) — Done
- [TASK-016: Job Profitability](../archive/backlog-done/TASK-016-job-profitability.md) — Done
- [TASK-060: Invoice discounts (negative adjustment lines)](../archive/backlog-done/TASK-060-invoice-discounts.md) — Done
- [TASK-084: Job Ledger — estimate vs actual](../archive/backlog-done/TASK-084-job-ledger.md) — Done (PR #546; was mis-IDd as 081)
- [TASK-085: Materials catalog schema](../archive/backlog-done/TASK-085-materials-catalog-schema.md) — Done
- [TASK-086: Learn materials catalog from receipts](../archive/backlog-done/TASK-086-learn-materials-catalog.md) — Done
- [TASK-087: Materials catalog UI + SKU search](../archive/backlog-done/TASK-087-materials-catalog-ui.md) — Done
- [TASK-088: Store purchase history import (HD + Lowe's)](../archive/backlog-done/TASK-088-store-purchase-history-import.md) — Done
- [TASK-089: T&M final invoice from actuals + mobile deliver](../archive/backlog-done/TASK-089-tm-final-invoice-actuals.md) — Done (PR #565; was mis-IDd as 082)
- [TASK-090: Separate estimate vs invoice document terms](../archive/backlog-done/TASK-090-estimate-invoice-document-terms.md) — Done (PR #566; was mis-IDd as 083)
