# TASK-155: Send via Square Invoice (card or ACH), payment link kept as an option

Status:
Proposed

Phase:
3

Epic:
EPIC-004 Billing & Profitability

Problem:
Online payment today is a Square Checkout **Quick Pay** link
(`createSquarePaymentLink`, `apps/web/lib/integrations/square-payments.ts`):
one fixed price, card / wallets only. Found 2026-09-23 closing out a large T&M
balance:

- **No ACH.** Checkout `accepted_payment_methods` has no bank-transfer option, so
  a client with a five-figure balance can only pay by card (highest fee).
- **No card surcharge.** Square card surcharges (beta) apply only to in-person
  Terminal / Mobile Payments SDK payments; the dashboard setting never reaches an
  API-created checkout link.
- **Link drift.** Every edit to a reopened invoice (TASK-154) needs a fresh link;
  each new link replaces `square_order_id`, so a client paying an older link is
  not matched by the webhook.

Square's **Invoices API** accepts card **and** `bank_account` (ACH), plus Cash App
and Afterpay, on a Square-hosted invoice page, and Square sends reminders and
receipts.

Business Value:
The client chooses card or bank transfer on one page. Large balances can go ACH
(lower fee) without the owner hand-collecting bank details. Payment lands back on
the Dovetails invoice automatically. The owner keeps the existing payment link
for quick one-off charges.

Scope (sliced):
- **Slice 1: Send via Square Invoice (owner, from the invoice page).**
  - The invoice page's Online Payment card gets a mode choice:
    **Square Invoice** (new) or **Payment link** (existing `SquareLinkActions`,
    unchanged). The owner picks per invoice; nothing is removed.
  - Square Invoice flow: find or create the Square customer (Customers API, by
    client email/phone) → create a Square order for the **amount due**
    (`amountDueCents`, one line: "INV-xxxx balance — {property}") → create and
    publish the invoice with `accepted_payment_methods` = card + bank_account
    (per-invoice toggles, default both on) and `delivery_method` = EMAIL or
    SHARE_MANUALLY (owner choice; SHARE_MANUALLY returns the public URL to copy).
  - Store `square_invoice_id`, `square_invoice_version`, `square_invoice_url`
    on the Dovetails invoice (additive migration). Show status + URL on the page.
- **Slice 2: Webhook reconciliation.**
  - Subscribe to `invoice.payment_made` (and `invoice.canceled`,
    `invoice.refunded`). Match by `square_invoice_id` (not `square_order_id`),
    record the payment on the Dovetails invoice with method `square` (card) or
    `ach` (bank transfer), idempotent on the Square payment id, then the existing
    `sync_invoice_on_payment` trigger settles status. Same `invoice.paid` +
    `closeJobIfFullyPaid` side effects as the other paid paths.
- **Slice 3: Keep Square in step with edits.**
  - Reopening a Dovetails invoice that has an unpaid published Square invoice
    cancels it (Invoices API cancel). Re-send offers to publish a new one for the
    new amount due. Never leave two payable Square invoices for one Dovetails
    invoice.
  - A partially paid Square invoice (e.g. ACH pending) blocks reopen until it
    settles, with a clear message.

Out of Scope:
- A card surcharge on Square invoices (not exposed by the Invoices API; revisit
  only if Square adds it). The ACH/cash **discount** alternative is a separate
  task if wanted.
- Replacing the Dovetails invoice or PDF: the Square invoice is the payment
  vehicle only; the Dovetails invoice stays the detailed bill of record.
- Syncing line items into Square (single balance line by design).
- Removing or changing the existing payment-link flow.

Open questions (owner, before slice 1):
- Default delivery: let Square email the invoice, or share the URL manually
  (and send it from Dovetails / text)?
- Should the client portal's Pay button also prefer the Square invoice URL when
  one is published?
- Confirm the Square access token has INVOICES_WRITE, ORDERS_WRITE, and
  CUSTOMERS_WRITE (add to `docs/working/square-payments-runbook.md`).

Acceptance Criteria (slice 1):
- [ ] Online Payment card offers "Square Invoice" and "Payment link"; the link flow behaves exactly as today.
- [ ] Square Invoice publishes for the current amount due with card + ACH enabled (toggleable).
- [ ] Existing Square customer is reused; a new one is created only when none matches.
- [ ] `square_invoice_id` / version / URL saved; URL copyable; delivery method honored.
- [ ] Unit tests: amount due (partial, deposit credit), customer match vs create, payload shape (mocked SDK).

Acceptance Criteria (slice 2):
- [ ] `invoice.payment_made` records one payment per Square payment id (replay-safe).
- [ ] ACH payments record as method `ach`, card as `square`.
- [ ] Fully paid → `invoice.paid` event + job auto-close, matching other paid paths.
- [ ] Integration test for webhook → payment → invoice status.

Acceptance Criteria (slice 3):
- [ ] Reopen cancels an unpaid published Square invoice; re-send can publish a fresh one.
- [ ] Reopen is blocked, with a message, while a Square invoice has an in-flight payment.
- [ ] Never two payable Square invoices for one Dovetails invoice (test).
