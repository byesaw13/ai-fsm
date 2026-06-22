# EPIC-004: Billing & Profitability

Closing the loop from completed work to invoice, payment, and an honest picture
of what each job actually earned.

## Active tasks

# TASK-017: Lead Source / Referral ROI

Status:
In Progress

Problem:
It is hard to tell which lead sources and referrals actually produce profitable
work.

Business Value:
Directs marketing/referral effort toward what pays off.

Scope:
- Attribute jobs/revenue to lead source and referral.
- Report ROI by source.

Out of Scope:
- Paid-ad platform integrations.

Acceptance Criteria:
- [ ] Revenue can be grouped by lead source / referrer.
- [ ] A report shows ROI per source.

Notes:
Partial: `apps/web/app/api/v1/reports/referrals/route.ts` exists; the full ROI
rollup is not complete.

# TASK-034: Payment Provider Model & Enriched Recorder

Status:
In Progress

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
- Online card processing (covered by TASK-035).

Acceptance Criteria:
- [ ] A payment can be recorded as deposit / progress / final, full or partial.
- [ ] Invoice balance and status update automatically.
- [ ] Methods include Venmo, Zelle, ACH, cash, check, Square, other.
- [ ] Invoice page shows total / deposit required / paid / balance / status.
- [ ] Each payment writes a workflow event and appears on the timeline.
- [ ] Manual recording works with no payment provider configured.

# TASK-035: Square Card Payments

Status:
Proposed

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

- [TASK-014: Invoice Generation from Visits](done/TASK-014-invoice-generation-from-visits.md) — Done
- [TASK-015: Payment Tracking](done/TASK-015-payment-tracking.md) — Done
- [TASK-016: Job Profitability](done/TASK-016-job-profitability.md) — Done
