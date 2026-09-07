# TASK-119: Quick-job billing seam — time → invoice for quick-booked jobs

Status:
Done

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
- [x] A quick-booked visit captures on-site time with one tap.
      (I'm here starts `job_work`; Complete visit stops it.)
- [x] Invoicing that job pre-fills hours at the bill rate with no manual entry;
      one action switches to a price-book rate or flat fee.
      (Toggle: `POST /api/v1/invoices/:id/labor-rate`. Create-invoice prefills
      T&M actuals because no-estimate jobs resolve as `hourly_internal`.)
- [x] The billed total is floored to the existing `minimum_service_fee_cents`
      (no second minimum added); per-job override works via the existing path.
- [x] `QuickBookModal` opens from all three launch points (Schedule +, My Day,
      global FAB) as one shared component.
- [x] "Done" closes the visit only; the business day stays open until Day Review.
      (Quick-book shape only: standard visit + work order + no estimate.
      Site visits and quoted jobs still require the packet.)
- [x] No duplicate booking/capture path is introduced.

Notes:
Priority item from the 2026-09-05 owner workflow review. Capture = existing
quick-book (`apps/web/app/api/v1/quick-book/route.ts`). Design + flow:
`docs/working/2026-09-05-quick-job-lane-spec.md`. Button placement is a field
surface (EPIC-006/007); the residual **here** is the billing seam.

Shipped (#624 slice 1, #625 slice 2, #626–#629):
- Service-minimum floor (#624, #625).
- Three launch points around one `QuickBookModal` (`components/jobs/QuickBookModal.tsx`);
  omitted assignee defaults to the current user so the visit lands on My Day (#626).
- Invoice labor Hourly / Price-book / Flat (#627).
- Skip photo/signature packet on quick-book visits (#628).
- Create-invoice prefills tracked time for no-estimate jobs (`jobPricingModeFromSources`
  defaults to `hourly_internal`) (#629).
Leftover (not an AC, deferred): manual time correction on the visit for
forgot-to-start.
