# TASK-086: Learn materials catalog from receipt line items

Status:
Done

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
- [x] Saving materials line items upserts catalog rows by SKU when present.
- [x] Second purchase of the same SKU updates last paid and average correctly.
- [x] Learn failure does not fail the line-items API response.

Notes:
`apps/web/lib/materials/catalog.ts` + unit tests. Archived in backlog truth
pass 2026-08-05.
