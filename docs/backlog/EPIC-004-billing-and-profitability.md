# EPIC-004: Billing & Profitability

Closing the loop from completed work to invoice, payment, and an honest picture
of what each job actually earned.

## Active tasks

# TASK-127: Pricing reconciliation — retire stray hardcoded labor rates

Status:
In Progress

Phase:
3

Problem:
A3 of the simplification plan. An audit (2026-09-07) found the pricing model is
far more consolidated than earlier notes assumed: one owner-editable customer
rate `business_pricing_settings.labor_billing_cents_per_hour` ($115 NH, +15% MA)
and one cost rate `labor_cost_cents_per_hour` ($50), read by both the estimate
engine (`buildPricingRules`) and invoices (`loadPricingSettings`). The multiple
pricing *methods* (hourly T&M, day-rate, painting per-sqft, price-book task
prices, target-margin) coexist by design and match how the owner quotes — NOT to
be collapsed. Travel time is already a single owner-editable setting
(`default_travel_time_rate_cents` + `travel_time_rate_mode`, resolved via
`resolveTravelTimeRateCents`). The remaining defect is a stray hardcode.

Business Value:
Every derived number comes from the owner's rate settings, so changing a rate in
Settings actually changes everything — no stale rate silently distorts a figure.

Scope:
- Fix `estimates/[id]/page.tsx`: it back-computed painting labor hours as
  `internal_labor_cost_cents / 8500` ($85) — the painting engine stores that cost
  as `hours × labor_cost_cents_per_hour` ($50), so $85 understated reopened hours
  by ~40%. Derive from the loaded cost rate via `laborHoursFromCostCents`.

Out of Scope:
- Collapsing the pricing methods into one (owner decision 2026-09-07: keep them).
- Changing the $115/$50 rate values (owner decision: clean up only, don't re-rate).
- Travel-time rate: already a single owner-editable setting; the T&M briefing's
  travel = labor line is an intentional draft convenience, superseded by the
  authoritative travel snapshot (owner chose a separate travel rate, which the
  travel settings + `resolveTravelTimeRateCents` already provide).

Acceptance Criteria:
- [x] The estimate detail page seeds painting labor hours from the account cost
      rate, not a hardcoded rate; unit-tested (`laborHoursFromCostCents`).
- [x] No customer-facing/derived figure uses a hardcoded labor rate that
      diverges from `business_pricing_settings`.

Notes:
A3 from the 2026-09-05 plan; owner decisions recorded 2026-09-07 (clean up stray
rates only; keep a separate travel-time rate as a setting). Audit detail in the
`project_pricing_reality` session note.

## Completed

- [TASK-120: Big-job billing — deposit gate + progress (thirds) billing](../archive/backlog-done/TASK-120-big-job-billing-deposit-progress.md) — Done (#633, #638)

- [TASK-119: Quick-job billing seam — time → invoice for quick-booked jobs](../archive/backlog-done/TASK-119-quick-job-billing-seam.md) — Done (#624–#629)

- [TASK-121: Unified job materials & spend view](../archive/backlog-done/TASK-121-unified-materials-spend-view.md) — Done (#634)

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
