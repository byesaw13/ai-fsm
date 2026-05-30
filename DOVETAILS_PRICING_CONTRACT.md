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
| `PAINTING_RATE_LABOR_CENTS` | $2.05/sqft | **Labor cost basis.** Used inside `calculatePaintingEstimate()` to price labor. Internal calculation only. |
| `PAINTING_RATE_CATALOG_CENTS` | $3.25/sqft | **Customer-facing catalog price** (service 5012). Includes labor + overhead + margin. Do NOT use in the estimator engine. |
| `PAINTING_RATE_MIN_CENTS` | $1.75/sqft | **Floor rate.** Use only when scope is uncertain or explicitly pricing at minimum. |
| `PAINTING_TRIM_ADD_CENTS` | +$0.20/sqft | Added to wall sqft total when baseboard/trim is included. |

**Why both?** The catalog price ($3.25) is what shows up in the price book for clients. The labor basis ($2.05) is what the painting estimator uses to price actual wall area before adding materials and overhead. Mixing these causes estimates to be ~60% too high.

---

## Prep Levels

**Two prep systems coexist — both are intentional:**

### System 1: Painting Estimator (numeric 1–10)

Used by `calculatePaintingEstimate()` and the painting estimate UI.

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
| `DEPOSIT_RATE` | 30% | Deposit due before scheduling. |
| `BALANCE_RATE` | 70% | Balance due upon completion. |
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

1. **Never hard-code a dollar value in app code.** Always import from `@ai-fsm/domain`.
2. **Never show `LABOR_COST_CENTS_PER_HOUR` to a customer.** It is internal only.
3. **Never use `PAINTING_RATE_CATALOG_CENTS` in `calculatePaintingEstimate()`.** It would price labor ~60% too high.
4. **When adding a new rate**, update this file AND `dovetails.ts` in the same commit.
5. **Before changing any value**, check `apps/web/lib/estimates/pricing.ts` and `estimate-engine/rules.ts` — both must stay in sync.
