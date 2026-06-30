# Dovetails Services LLC — Pricing Contract

**Last reviewed:** 2026-05-30  
**Source of truth:** `packages/domain/src/dovetails.ts`  
**Rule:** Never hard-code these values in app code. Import from `@ai-fsm/domain`.

---

## Labor

| Constant | Value | Purpose |
|---|---|---|
| `LABOR_COST_CENTS_PER_HOUR` | $85.00/hr | Internal burdened cost. Never shown to customers. Used for margin calculations. |
| `LABOR_CUSTOMER_RATE_CENTS_PER_HOUR` | $115.00/hr | Customer-facing T&M or add-on labor line items. |
| `MINIMUM_SERVICE_FEE_CENTS` | $185.00 | Minimum billable value per visit. Requires `minimum_service_override_reason` to waive. |

---

## Block Pricing

| Constant | Value | Purpose |
|---|---|---|
| `HALF_DAY_RATE_CENTS` | $515.00 | Covers up to 4 booked labor hours. |
| `FULL_DAY_RATE_CENTS` | $980.00 | Covers up to 7 booked labor hours. |

Use block pricing when 4+ services are bundled in one visit. Guardrail warning fires at 4+ line items.

---

## Bundle Discount

| Constant | Value | Purpose |
|---|---|---|
| `BUNDLE_DISCOUNT_RATE` | 12% | Applied when 4+ distinct tasks are combined. |
| `BUNDLE_DISCOUNT_MIN_TASKS` | 4 tasks | Threshold to trigger bundle consideration. |
| `BUNDLE_MARGIN_FLOOR` | 30% | Minimum gross margin — estimates below this are blocked. |

---

## Painting Rates

**Two rates exist intentionally — they are NOT the same thing:**

| Constant | Value | Purpose |
|---|---|---|
| `PAINTING_RATE_LABOR_CENTS` | $2.05/sqft | **Labor cost basis.** Used inside `computeEstimate()` / `sqftPaintingToSpec()` to price labor. Internal calculation only. |
| `PAINTING_RATE_CATALOG_CENTS` | $3.25/sqft | **Customer-facing catalog price** (service 5012). Includes labor + overhead + margin. Do NOT use in the estimator engine. |
| `PAINTING_RATE_MIN_CENTS` | $1.75/sqft | **Floor rate.** Use only when scope is uncertain or explicitly pricing at minimum. |
| `PAINTING_TRIM_ADD_CENTS` | +$0.20/sqft | Added to wall sqft total when baseboard/trim is included. |

**Why both?** The catalog price ($3.25) is what shows up in the price book for clients. The labor basis ($2.05) is what the painting estimator uses to price actual wall area before adding materials and overhead. Mixing these causes estimates to be ~60% too high.

---

## Prep Levels

**Two prep systems coexist — both are intentional:**

### System 1: Painting Estimator (numeric 1–10)

Used by `computeEstimate()` (via `sqftPaintingToSpec`) and the painting estimate UI.

| `PREP_LEVEL_MULTIPLIERS` | Multiplier |
|---|---|
| 1–5 (standard) | 1.00× |
| 6 | 1.08× |
| 7 | 1.14× |
| 8 | 1.20× |
| 9 | 1.28× |
| 10 (heavy) | 1.38× |

Stored as integer in `estimates.prep_level` column.

### System 2: Estimate Engine (4-level string)

Used by `estimate-engine/rules.ts` for room-by-room estimates.

| Level | Multiplier | When to use |
|---|---|---|
| `none` / `minor` | 1.00× | Surface is clean, standard prep included |
| `moderate` | 1.14× | Scuffs, minor damage, caulk gaps — patch + sand |
| `major` | 1.38× | Significant patching, skim coat, heavy repair needed |

---

## Materials

| Constant | Value | Purpose |
|---|---|---|
| `MATERIAL_HANDLING_CLIENT_RATE` | 15% | Customer-facing handling fee shown on estimates. Applied to material subtotal. |
| `MATERIAL_MARKUP_TIERS` | 0% / 30% / 22.5% | **Internal** tiered markup for cost accounting. Under $25: bundled into labor. $25–$250: 30%. Over $250: 22.5%. |

**When to use which:** `MATERIAL_HANDLING_CLIENT_RATE` appears on customer estimates as a handling line item. `MATERIAL_MARKUP_TIERS` / `calculateMaterialMarkup()` is for internal P&L — what Dovetails actually marks up materials by before presenting to the customer.

---

## Deposits & Payment

| Constant | Value | Purpose |
|---|---|---|
| Explicit deposit policy | No default | Deposits are selected per estimate: none, materials-only, percentage, or fixed. |
| Balance due | Derived | Project total minus any explicit deposit due or credited. |
| `PAYMENT_OPTIONS` | Check / Venmo / Square | Shown on all estimates and invoices. |

---

## Emergency & After-Hours

| Window | Multiplier | Notes |
|---|---|---|
| Saturday daytime | 1.40× | |
| Sunday daytime | 1.50× | |
| Weekday evenings (5pm–10pm) | 1.50× | |
| Overnight (10pm–6am) | 2.00× | 2-hr minimum + $150 dispatch |
| Federal holiday | 2.00× | 2-hr minimum |
| True emergency (active hazard) | 2.00× | +$200 dispatch fee |

---

## Regional Pricing

| Constant | Value | Purpose |
|---|---|---|
| `MA_LABOR_RATE_DELTA` | +15% | Applied to NH baseline for Massachusetts jobs (higher regulation, longer drive). |

---

## Deprecation Log

| Old name | New name | Status |
|---|---|---|
| `MATERIAL_HANDLING_RATE` | `MATERIAL_HANDLING_CLIENT_RATE` | Deprecated alias — kept for test compat, remove in next major cleanup |
| `PAINTING_RATE_STANDARD_CENTS` | `PAINTING_RATE_LABOR_CENTS` | Deprecated alias — kept for backward compat |

---

## Rules

1. **Never hard-code a dollar value in app code.** Always import active pricing constants from `@ai-fsm/domain`. Deposit policy is explicit per estimate and must not default from a pricing constant.
2. **Never show `LABOR_COST_CENTS_PER_HOUR` to a customer.** It is internal only.
3. **Never use `PAINTING_RATE_CATALOG_CENTS` in the estimate engine.** It would price labor ~60% too high.
4. **When adding a new rate**, update this file AND `dovetails.ts` in the same commit.
5. **Before changing any value**, check `packages/domain/src/estimate-engine/rules.ts` — it imports from `dovetails.ts` and is the single computation path after PR8.

## Canonical computation path (PR8)

All estimate pricing flows through:

```typescript
import { computeEstimate, CURRENT_RULES, sqftPaintingToSpec, roomSpecsToEstimateSpec } from "@ai-fsm/domain";
```

| Flow | Adapter | Notes |
|---|---|---|
| Sqft / quick painting | `sqftPaintingToSpec(input)` | Preserves legacy `calculatePaintingEstimate` totals via flat line items |
| Room-by-room painting | `roomSpecsToEstimateSpec(rooms, options)` | Maps dimensional `room_specs` → engine surfaces |
| Guardrails (web) | `reviewEstimateGuardrails()` in `apps/web/lib/estimates/guardrails.ts` | Thin adapter over `evaluateGuardrails()` |

Read paths for materials: `shopping_list_json` first, then `room_specs` fallback via `buildShoppingListFromEstimateResult()`.


## Deposit Policy Update

The system must not assume a deposit. Legacy constants `DEPOSIT_RATE` and `BALANCE_RATE` are retained only for backward compatibility and must not be used to calculate new estimate deposits. New estimate deposits are explicit payment policy, separate from job pricing.
