# EPIC-004: Billing & Profitability

Closing the loop from completed work to invoice, payment, and an honest picture
of what each job actually earned.

## Active tasks

# TASK-017: Lead Source / Referral ROI

Status:
In Progress

Phase:
3

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

# TASK-068: Payment Provider Model & Enriched Recorder

Status:
In Progress

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
- [ ] A payment can be recorded as deposit / progress / final, full or partial.
- [ ] Invoice balance and status update automatically.
- [ ] Methods include Venmo, Zelle, ACH, cash, check, Square, other.
- [ ] Invoice page shows total / deposit required / paid / balance / status.
- [ ] Each payment writes a workflow event and appears on the timeline.
- [ ] Manual recording works with no payment provider configured.

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

# TASK-071: Set a deposit on any invoice (Square-style single invoice)

Status:
In Progress

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
- [ ] A standard invoice can carry a deposit policy (none/percentage/fixed),
      off by default, editable until paid in full.
- [ ] The Square deposit link charges the computed amount; the balance link
      charges total − paid; both feed paid_cents.
- [ ] deposit_cents / balance_cents and the estimate deposit/final flow are
      unchanged.

Notes:
Percentage is of the full total incl. tax. Owner decisions 2026-07-20: off by
default, % of full total incl. tax, editable until paid in full.

# TASK-078: Invoices tied to an open job are due on completion (no premature past-due)

Status:
In Progress

Phase:
3

Problem:
Dovetails' terms are "due upon completion," but the owner invoices the whole job
up front and takes a deposit. At issue time there is no completion date, so
`dueDateUponCompletion()` defaults to **today** (`packages/domain/src/dovetails.ts`),
and the send route stamps `due_date` = the send day. A day later the invoice reads
as **past due**, "Client owes this now" shows on the remaining balance, and the
follow-up worker (`services/worker/src/invoice-followup.ts`) would email the client
overdue reminders — for money that isn't actually due until the job is finished.

Business Value:
Honest money state (a canonical product principle): the balance shows "Due on
completion" and never dun the client until the work is actually done, while the
deposit is still collected up front. Matches how the owner really bills.

Scope:
- **Data:** a new standard/final invoice tied to an open job stores `due_date =
  NULL` (not today); it is filled to the completion day when the owner marks the
  **job** complete (`jobs/[id]/transition` → completed) via the one-time null→value
  fill the immutability trigger already allows (migration 149). Deposit invoices
  (`invoice_kind = 'deposit'`) and jobless/ad-hoc invoices stay due-now. Covers the
  create, estimate→invoice convert, and send paths.
- **Display:** owner invoice page, the invoices list, and the client portal show
  "Due on completion" — not a past date, not "owes now"/"OVERDUE" — whenever the
  linked job is not complete. This fixes **existing** invoices too (their stored
  past `due_date` is immutable, so the display gates on job completion, not the
  raw date).
- **Dunning:** the follow-up worker skips invoices whose linked job is not complete.

Out of Scope:
- Net terms after completion (e.g. net-15) — completion day is the due date for
  now; a configurable net-N is a later task.
- Retroactively rewriting existing invoices' stored `due_date` (immutable by
  migration 149; the display/worker gates cover them instead).
- Separate deposit-invoice + final-invoice workflow (the owner uses one whole-job
  invoice + a deposit payment; unaffected here).

Acceptance Criteria:
- [ ] A standard/final invoice created/sent for an open job has no past `due_date`
      and shows "Due on completion"; a deposit or jobless invoice is unchanged.
- [ ] Marking the job complete fills the invoice's `due_date` to the completion day.
- [ ] While the job is open, the owner page, list, and portal never show past-due /
      "owes now" / "OVERDUE"; the follow-up worker does not dun it.
- [ ] The due-date resolution + "due on completion" predicate are pure and
      unit-tested.

Notes:
Phase 3 (Estimate & Billing Closure). Builds on `dueDateUponCompletion`
(`packages/domain/src/dovetails.ts`) and the immutability trigger (migration 149).
No new migration — `due_date` is already nullable.

# TASK-081: Job Ledger — estimate vs actual on the project page


Status:
In Progress

Phase:
3

Problem:
T&M commercial truth (estimate allowances, billable hours, materials receipts,
lift, deposits, change orders) is scattered across estimate, materials, tracked
days, and profitability. Owners need AI or spreadsheets to answer "what do we
bill / CO?" for jobs like Claremont.

Business Value:
One Job Ledger on the project page makes estimate vs actual, balance, and draft
change orders navigable without leaving the job — honest money, one place to look.

Scope:
- Job Ledger card on `/app/jobs/[id]` (customer rates, not internal cost).
- Domain `buildJobLedger` composition of estimate lines, job_work hours,
  materials receipts, equipment, COs, paid invoices.
- Draft CO from variance (draft only; COs remain estimate-scoped).
- Expense `commercial_tag` for Schedule A/B / equipment.
- Internal P&L remains separate (cost margin).

Out of Scope:
- Client portal ledger; auto-send CO/invoice; SKU plan↔receipt matching;
  dedicated `/money` page (v2 if needed).

Acceptance Criteria:
- [x] Opening a T&M project shows Sold / Actual / Paid / Balance and bucket
      variance without chat.
- [x] Labor actual uses tracked hours × customer rate from estimate.
- [x] Materials actual vs allowance; Draft CO when over and estimate approved.
- [x] Open draft CO or approved coverage suppresses duplicate draft button.
- [x] Flat-rate balance stays sold − paid even when materials receipts exist.
- [x] Multi-option estimate lines with `option_id` are excluded from budgets.
- [x] Techs do not see the ledger.

Notes:
Spec: `docs/superpowers/specs/2026-07-30-job-ledger-design.md`.
PR: feat/job-ledger.

# TASK-085: Materials catalog schema (avg, count, SKU unique)

Status:
In Progress

Phase:
3

Problem:
`materials_price_book` stores a single unit cost and optional SKU, but cannot
represent last-paid vs average paid, has no purchase count, and has no unique
index on SKU — so barcode identity is weak.

Business Value:
A durable materials price identity so the same SKU does not fork into many
name-based rows and pricing decisions use real paid history.

Scope:
- Additive migration: `avg_paid_cents`, `purchase_count`, partial unique index
  on `(account_id, lower(btrim(sku)))` for active rows with non-empty SKU.
- Expose new fields on materials API GET/POST/PATCH responses.
- Spec: `docs/superpowers/specs/2026-07-31-materials-catalog-receipt-learning-design.md`.

Out of Scope:
- Full purchase observation history table.
- Estimate auto-fill from catalog.

Acceptance Criteria:
- [ ] Migration is additive and reversible in comments.
- [ ] Active rows cannot share the same SKU within an account.
- [ ] API returns `avg_paid_cents` and `purchase_count`.

# TASK-086: Learn materials catalog from receipt line items

Status:
In Progress

Phase:
3

Problem:
Itemized receipt lines (with SKU and unit cost) never update
`materials_price_book`, so the catalog stays empty unless filled by hand.

Business Value:
Every materials receipt automatically improves the price catalog used for
future estimates and job costing judgment.

Scope:
- `learnMaterialsFromLineItems` helper: match SKU first, else name+unit;
  update last paid (`unit_cost_cents`), rolling average, purchase_count,
  last_purchased_at, supplier.
- Call after successful materials line-items save (non-fatal on error).
- Unit tests for average math and match order.

Out of Scope:
- Learning non-`materials` categories.
- Blocking expense save if learn fails.

Acceptance Criteria:
- [ ] Saving materials line items upserts catalog rows by SKU when present.
- [ ] Second purchase of the same SKU updates last paid and average correctly.
- [ ] Learn failure does not fail the line-items API response.

# TASK-087: Materials catalog UI + SKU search

Status:
In Progress

Phase:
3

Problem:
There is no product UI for browsing or editing the materials price catalog
(the service Price Book is a different catalog).

Business Value:
Owner can look up last/avg paid by name or barcode when pricing a job or
checking spend patterns.

Scope:
- Page `/app/materials` with search (name/SKU), category/supplier filters,
  last/avg/count display, edit/deactivate.
- Settings link next to Price Book / Expenses.
- GET `/api/v1/materials` search includes SKU.

Out of Scope:
- Field tech primary nav entry.
- Estimate material picker integration.

Acceptance Criteria:
- [ ] Owner/admin can open Materials Catalog, search by SKU, edit a row.
- [ ] Settings exposes the link.
- [ ] Empty state points at receipt upload and import.

# TASK-088: Home Depot purchase history import

Status:
In Progress

Phase:
3

Problem:
Years of HD purchase history already exist as CSV in-repo but are not in the
catalog.

Business Value:
Seed thousands of real SKU/prices immediately so the catalog is useful before
the next receipt is scanned.

Scope:
- Owner-only `POST /api/v1/materials/import` accepting HD-style CSV (or text).
- Map SKU Number, SKU Description, Net Unit Price, Date, Department → catalog
  learn path; skip invalid/negative rows with a summary response.
- Optional script wrapping the same parser for ops.

Out of Scope:
- Continuous sync with HD accounts.
- Multi-format vendor adapters beyond HD export columns.

Acceptance Criteria:
- [ ] Importing the in-repo HD CSV produces catalog rows keyed by SKU.
- [ ] Response reports imported / skipped / sample errors.
- [ ] Re-import updates last/avg rather than creating duplicates for same SKU.


## Completed

- [TASK-014: Invoice Generation from Visits](../archive/backlog-done/TASK-014-invoice-generation-from-visits.md) — Done
- [TASK-015: Payment Tracking](../archive/backlog-done/TASK-015-payment-tracking.md) — Done
- [TASK-016: Job Profitability](../archive/backlog-done/TASK-016-job-profitability.md) — Done
- [TASK-060: Invoice discounts (negative adjustment lines)](../archive/backlog-done/TASK-060-invoice-discounts.md) — Done
