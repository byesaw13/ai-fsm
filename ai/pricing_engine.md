# Pricing Engine & Business Rules: Dovetails FSM

## 1. Core Labor & Service Rates
The following baseline rates are defined in [dovetails.ts](file:///packages/domain/src/dovetails.ts) and must be treated as locked business invariants:

- **Customer Labor Rate**: `$115.00 / hour` (`115_00` cents/hr). Used for T&M or add-on labor lines.
- **Minimum Service Fee**: `$185.00` (`185_00` cents). The baseline fee for any dispatched visit.
- **Half-Day Block Rate**: `$515.00` (`515_00` cents). For visits estimated up to 4 hours.
- **Full-Day Block Rate**: `$980.00` (`980_00` cents). For visits estimated up to 8 hours.
- **Bundle Discount**: `12%` (`0.12` multiplier). Applied to multi-service estimates to optimize scheduling efficiency.
- **Massachusetts Labor Surcharge**: `+15%` (`0.15` delta modifier). Applied to jobs located in Massachusetts to offset higher tax and regulatory costs.

## 2. Painting & Drywall Service Rates
- **Painting Catalog Customer Price**: `$3.25 / sq ft` (`325` cents). Catalog-facing rate.
- **Painting Labor Basis**: `$2.05 / sq ft` (`205` cents). Internal calculation base for painting estimates.
- **Painting Floor Budget Rate**: `$1.75 / sq ft` (`175` cents). Absolute minimum rate for painting scopes.

## 3. Materials Markup & Handling
- **Material Handling Fee**: `15%` (`0.15`). Client-facing handling rate added to material totals.
- **Tiered Materials Markup**:
  - Under `$25.00`: `0%` markup (materials cost is bundled into labor).
  - `$25.00` to `$250.00`: `30%` markup (`0.30` multiplier).
  - Over `$250.00`: `20%` markup (`0.20` multiplier).

## 4. Emergency Dispatches
Multipliers applied to base labor rates depending on dispatch window:
- **Same-Day Emergency (Business Hours)**: `1.5x` base rate.
- **After-Hours / Nights**: `1.75x` base rate.
- **Weekend / Holiday**: `2.0x` base rate.
