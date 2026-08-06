# TASK-069: Square Card Payments

Status:
Done

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
- [x] Square secrets are stored server-side only, owner-only, and testable.
- [x] A payment link can be created for deposit, balance, or custom amount.
- [x] The webhook verifies signatures and ignores duplicate events.
- [x] A completed Square payment marks the invoice partially/fully paid.
- [x] Square can be disabled without breaking manual recording.

Notes:
Implementation shipped earlier (settings, link, webhook, portal pay, refunds,
unit tests, `docs/working/square-payments-runbook.md`). Acceptance was left open
only for live verification with real Square credentials.

**Closed 2026-08-06:** Owner confirmed a real customer payment completed through
production Square into the real Square account and settled correctly in Dovetails
OS. Code evidence: `lib/integrations/square-payments.ts`,
`api/v1/integrations/square`, `api/v1/invoices/[id]/square-link`,
`api/webhooks/square`, Settings SquarePanel, portal pay-by-card.
