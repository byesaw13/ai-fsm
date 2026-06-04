# Membership Pricing Field Ownership

Item 6 of the domain simplification plan.

## Problem

The `maintenance_plans` table has two price fields that overlap:

| Field | Origin | Meaning |
|---|---|---|
| `price_cents` | Original schema (migration 001) | Per-visit or per-period price. Required NOT NULL in original schema. |
| `annual_price_cents` | Later addition | Total annual membership price including add-ons. |

Both exist. `price_cents` is a legacy field. `annual_price_cents` is canonical.

## Canonical Rule

**`annual_price_cents` is the source of truth for membership pricing.**

- Display total membership value using `annual_price_cents`.
- ARR calculations in the membership dashboard use `annual_price_cents`. ✓ (already correct)
- `price_cents` is a legacy snapshot. It was set at enrollment and may be
  stale if add-ons were later modified.
- The enrollment API (`POST /api/v1/maintenance-plans`) still writes both fields.
  This is acceptable for backward compatibility with the portal.

## Code References

| File | Field used | Status |
|---|---|---|
| `apps/web/app/api/v1/maintenance-plans/route.ts` | Writes both `price_cents` and `annual_price_cents` | Acceptable — keeps portal working |
| `apps/web/app/api/v1/maintenance-plans/[id]/route.ts` | PATCH accepts both | Acceptable |
| `apps/web/app/app/membership-dashboard/page.tsx` | Reads `annual_price_cents` for ARR | Correct |
| `apps/web/app/portal/[clientToken]/page.tsx` | Shows `price_cents` as "per period" | Legacy — acceptable for now |
| `apps/web/app/app/maintenance-plans/[id]/edit/SubscriptionEditForm.tsx` | Sends `annual_price_cents` | Correct |

## Compatibility Layer

`price_cents` = `ROUND(annual_price_cents / MAX(visit_count_per_year, 1))` when
a template is linked. The edit form already computes this on save. This approach
is sufficient — no migration needed.

## Migration Plan (future, not urgent)

When ready to clean up:
1. Add a migration that sets `price_cents = ROUND(annual_price_cents / GREATEST(annual_visit_count, 1))` for all rows where `price_cents` is stale.
2. Mark `price_cents` as deprecated in schema with a comment.
3. Remove `price_cents` writes from new code.
4. Physical column removal only after portal no longer references it.

## What to Do Now

- Do not add new reads of `price_cents` for display outside the portal.
- When building pricing UI, always use `annual_price_cents`.
- When the portal is updated, switch its per-period display to
  `annual_price_cents / billing_periods_per_year` instead of `price_cents`.
