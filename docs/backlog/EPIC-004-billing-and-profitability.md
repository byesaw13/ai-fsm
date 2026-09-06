# EPIC-004: Billing & Profitability

Closing the loop from completed work to invoice, payment, and an honest picture
of what each job actually earned.

## Active tasks

# TASK-119: Quick-job billing seam — time → invoice for quick-booked jobs

Status:
Proposed

Phase:
3

Problem:
From a workflow review with the owner: quick jobs ("come assemble a bed") are
abandoned to paper, then billed by making a manual invoice and re-entering
everything — hours, client history, repeat-work signal all lost. The **capture**
step is already solved on main: `POST /api/v1/quick-book` + `QuickBookModal`
create client-or-new + job + default work order + scheduled visit in one
transaction, no estimate. What's missing is the seam from that quick-booked visit
to getting paid: time is never captured on it, and the invoice is built from
scratch.

Business Value:
High-frequency small jobs get billed straight from the schedule with hours
already on the invoice — no paper, no re-entry.

Scope:
- One-tap start/stop time on a quick-booked visit using the existing clock /
  `activity_entries`. "Done" **closes the visit but leaves the business day open**
  (day closes at Day Review — matches TASK-052/056 lifecycle independence).
- Invoice from the job with the labor line pre-filled from tracked time at
  `labor_billing_cents_per_hour` via the existing bridge
  (`upsertLaborLineFromTrackedTime`, `lib/invoices/line-items.ts`), with a toggle
  to a price-book task rate or flat fee ("whichever is most profitable").
- Floor the billed total to the **existing** `minimum_service_fee_cents`
  (`packages/domain/src/pricing-settings.ts`, applied via `buildPricingRules`) —
  do NOT add a second minimum; reuse the existing per-record override path for
  per-job adjustment. (The owner's "1-hour minimum" = set that value; it is
  currently ~$185.)
- Surface the existing `QuickBookModal` from **three launch points** — Schedule
  "+" (exists), a My Day button, and the global FloatingActionButton — one shared
  component, no forked flow.
- Manual time correction on the visit (reuse the TASK-052 clock-correction
  pattern) for the forgot-to-start case.

Out of Scope:
- Rebuilding capture — **quick-book already does it; do NOT create a second
  booking flow** off the separate Quick Project path.
- Estimates for quick jobs (never).
- Full 4-labor-rate reconciliation (pricing work / PI-002/004) — uses the one
  bill rate.

Acceptance Criteria:
- [ ] A quick-booked visit captures on-site time with one tap.
- [ ] Invoicing that job pre-fills hours at the bill rate with no manual entry;
      one action switches to a price-book rate or flat fee.
      (Toggle shipped: invoice editor Hourly / Price-book / Flat via
      `POST /api/v1/invoices/:id/labor-rate`. Prefill-on-create still uses
      existing T&M path.)
- [ ] The billed total is floored to the existing `minimum_service_fee_cents`
      (no second minimum added); per-job override works via the existing path.
- [x] `QuickBookModal` opens from all three launch points (Schedule +, My Day,
      global FAB) as one shared component.
- [ ] "Done" closes the visit only; the business day stays open until Day Review.
- [ ] No duplicate booking/capture path is introduced.

Notes:
Priority item from the 2026-09-05 owner workflow review. Capture = existing
quick-book (`apps/web/app/api/v1/quick-book/route.ts`). Design + flow:
`docs/working/2026-09-05-quick-job-lane-spec.md`. Button placement is a field
surface (EPIC-006/007); the residual **here** is the billing seam.

Shipped so far:
- Service-minimum floor (#624 slice 1, #625 slice 2).
- Three launch points around one `QuickBookModal` (`components/jobs/QuickBookModal.tsx`);
  omitted assignee defaults to the current user so the visit lands on My Day.

# TASK-120: Big-job billing — deposit gate + progress (thirds) billing

Status:
Proposed

Phase:
3

Problem:
From a workflow review with the owner: big multi-day jobs **always** take a
deposit before work starts, but that's a manual detour today rather than a step
in the approve→start flow. And long jobs need staged billing — the owner's rule
is **jobs longer than two weeks bill in thirds (⅓ up front as the deposit, ⅓ at
the midpoint, final at completion)**. Deposits exist (TASK-071, done); explicit
progress/staged invoicing likely does not.

Business Value:
Cash flow matches how the work is actually funded — money up front on every big
job, and a middle payment on long ones so the owner isn't carrying weeks of
labor and materials before seeing a dime.

Scope:
- Make "take a deposit" a first-class step right after estimate approval (reuse
  the existing invoice deposit form + MarkDepositReceived), so starting a big job
  prompts/records the deposit rather than requiring a manual invoice.
- Add **progress billing**: for jobs over a duration threshold (default 2 weeks),
  support a ⅓ / ⅓ / final schedule — deposit, midpoint, completion — with each
  stage generating an invoice against the job total.

Out of Scope:
- Automatic detection of the 2-week threshold beyond a simple prompt/flag (owner
  can opt a job into staged billing).
- Changing how job totals or line items are computed.

Acceptance Criteria:
- [ ] Approving a big estimate leads directly into recording a deposit (no manual
      standalone-invoice detour).
- [ ] A job can be billed in thirds (deposit / midpoint / final), each stage a
      tracked invoice summing to the job total.
- [ ] Existing single-invoice-at-completion flow still works for normal jobs.

Notes:
From the 2026-09-05 owner workflow review. Deposit primitive = TASK-071 (done).
Pairs with TASK-119 (quick-job billing) and TASK-121 (job spend view).

# TASK-121: Unified job materials & spend view

Status:
Proposed

Phase:
3

Problem:
Job materials live in two places — the planned **buy list** and **ad-hoc expense
receipts** attached to the job — so there is no single view of planned vs actual
spend. (Per-task check-off is **already shipped and synced** via `VisitDayTasks`
+ `JobTasksPanel` over `work_order_tasks` — NOT in scope.)

Business Value:
One honest picture of what a job planned to spend vs what it actually spent,
feeding job profitability.

Scope:
- A single "job materials & spend" view merging the buy list and the job's
  `expenses` receipts, with a spend total rolling into job cost / the job ledger.

Out of Scope:
- Task check-off sync (already shipped — TASK-018 work-order tasks).
- Changing the Job→Visit→Work Order model.

Acceptance Criteria:
- [ ] One job view shows planned buy-list items and ad-hoc receipts together with
      a spend total, comparable against the estimate.

Notes:
From the 2026-09-05 owner workflow review (materials "mix of buy list + ad-hoc
receipts"). The task-sync half of the original idea was dropped — already built.

## Completed

- [TASK-069: Square Card Payments](../archive/backlog-done/TASK-069-square-card-payments.md) — Done (live prod payment verified 2026-08-06)

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
