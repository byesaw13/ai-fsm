# TASK-127: Pricing reconciliation — retire stray hardcoded labor rates

Status:
Done

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

