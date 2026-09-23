# TASK-153: Final invoice credits prior invoices + approved change orders reach the bill

Status:
Proposed

Phase:
3

Epic:
EPIC-004 Billing & Profitability

Problem:
Found closing out J-2026-0029 (Peter Marinelli, 4 Ash St, 2026-09-23). The job
was billed T&M, but the app could not produce the final bill:

- **An up-front standard invoice blocks the final invoice.**
  `createDraftFinalInvoiceForJob` (`apps/web/lib/invoices/final-invoice.ts`)
  returns null when any `standard` or `final` invoice exists on the job. INV-0001
  was issued as a `standard` invoice for the full $13,535 estimate (30% paid up
  front), so completing the job never drafts a final invoice.
- **Only deposit/progress invoices are credited.** `loadCreditedInvoicesForEstimate`
  (`apps/web/lib/invoices/db.ts`) credits `invoice_kind IN ('deposit','progress')`.
  A prior standard invoice is not subtracted, so a hand-built actuals invoice
  would double-bill everything already invoiced.
- **Approved change orders never reach an invoice.** `change_orders` are a
  record only; nothing writes `invoice_line_items.change_order_id`. Approving one
  changes nothing the customer is billed.
- **Change orders can't hold a credit.** Line items are `nonnegative`, so a
  "work done by others" credit had to be netted into one lump-sum line.
- **The job read as flat-rate.** The estimate carried `pricing_mode = flat_rate`
  and the job `pricing_mode` was null, so the TASK-089 T&M actuals path would not
  have fired even without the block above.

Workaround used: a second manual invoice on the job carrying the net change
(+$2,336.02 changes, −$1,300.00 credit adjustment line), INV-0001 left as-is.

Business Value:
One-click honest final bill on a job that was invoiced up front: actuals (T&M) or
estimate + approved change orders (flat rate), minus everything already
invoiced. No hand math in another tool, no double-billing risk.

Scope:
- **Slice 1 — credit prior invoices (T&M first).** Final invoice creation no
  longer skips when a prior non-void standard invoice exists; it drafts the final
  invoice and credits every prior non-void invoice on the job (deposit, progress,
  standard) as "Less previously invoiced — INV-xxxx". Balance = actuals − prior
  invoiced; payments stay on their original invoices.
- **Slice 2 — approved change orders on flat-rate final invoices.** For
  `flat_rate` jobs, each approved change order's lines are copied onto the final
  invoice with `change_order_id` set. For `hourly_internal` (T&M) jobs they are
  NOT copied — actuals already include the work; the change order is shown as the
  approval record only. This rule is the whole point: copying on T&M double-bills.
- **Slice 3 — credit lines on change orders.** Allow a negative line on a change
  order when it is explicitly a credit (mirror the invoice `adjustment` rule).

Out of Scope:
- Customer e-signature on change orders (verbal approval stays an owner-recorded
  approve action).
- Rewriting sent/partial invoices (stay immutable).
- Changing the 15% material-handling behavior.

Open question (owner decision, before slice 1):
- Should a job's T&M vs flat-rate mode be set explicitly on the job at approval
  time (so the estimate's `pricing_mode` can't silently disagree with how the job
  is billed)?

Acceptance Criteria (slice 1):
- [ ] Completing a job that already has a partial/sent standard invoice drafts a final invoice.
- [ ] The final invoice subtracts all prior non-void invoices on the job, each on its own labeled line.
- [ ] Void and cancelled invoices are not credited.
- [ ] Unit tests: prior standard, prior deposit + progress, prior void, no prior invoice (unchanged).

Acceptance Criteria (slice 2):
- [ ] Flat-rate final invoice includes approved change-order lines, linked by `change_order_id`.
- [ ] Draft, sent, and declined change orders are not billed.
- [ ] T&M final invoice does not copy change-order lines.
- [ ] Unit tests cover flat-rate copy, T&M no-copy, and non-approved exclusion.

Acceptance Criteria (slice 3):
- [ ] A change order accepts a negative credit line; totals net correctly; tests cover it.
