# TASK-085: Materials catalog schema (avg, count, SKU unique)

Status:
Done

Phase:
3

Problem:
`materials_price_book` stores a single unit cost and optional SKU, but cannot
represent last-paid vs average paid, has no purchase count, and has no unique
index on SKU — so barcode identity is weak.

Business Value:
A durable materials price identity so the same SKU does not fork into many
name-based rows and pricing decisions use real paid history.

Scope:
- Additive migration: `avg_paid_cents`, `purchase_count`, partial unique index
  on `(account_id, lower(btrim(sku)))` for active rows with non-empty SKU.
- Expose new fields on materials API GET/POST/PATCH responses.
- Spec: `docs/superpowers/specs/2026-07-31-materials-catalog-receipt-learning-design.md`.

Out of Scope:
- Full purchase observation history table.
- Estimate auto-fill from catalog.

Acceptance Criteria:
- [x] Migration is additive and reversible in comments.
- [x] Active rows cannot share the same SKU within an account.
- [x] API returns `avg_paid_cents` and `purchase_count`.

Notes:
Migration `162_materials_catalog_stats.sql`. Archived in backlog truth pass
2026-08-05 (code already on main).
