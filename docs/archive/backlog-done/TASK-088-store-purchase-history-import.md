# TASK-088: Store purchase history import (Home Depot + Lowe's)

Status:
Done

Phase:
3

Problem:
Years of HD purchase history already exist as CSV in-repo but are not in the
catalog. Lowe's purchase history is needed the same way for materials + job
costing.

Business Value:
Seed thousands of real SKU/prices immediately so the catalog is useful before
the next receipt is scanned. Cover both primary supply houses used in the field.

Scope:
- Owner-only expense CSV import auto-detecting Home Depot Pro Xtra and Lowe's
  purchase-history exports (`home_depot_csv` / `lowes_csv` sources).
- Map date, invoice/order id, item #, description, qty, unit/extended price,
  optional PO/job tag → expenses + materials catalog learn path.
- Owner-only `POST /api/v1/materials/import` accepting HD-style CSV (or text).
- Optional script wrapping the same parser for ops.

Out of Scope:
- Continuous sync with HD / Lowe's accounts.
- Additional vendors beyond Home Depot and Lowe's (Ace, Benson's, etc.) until needed.

Acceptance Criteria:
- [x] Importing the in-repo HD CSV produces catalog rows keyed by SKU.
- [x] Lowe's purchase CSV auto-detects and imports without being rejected as non-HD.
- [x] Response reports imported / skipped / sample errors.
- [x] Re-import updates last/avg rather than creating duplicates for same SKU.

Notes:
`POST /api/v1/materials/import`; Lowe's path PR #551. Archived in backlog
truth pass 2026-08-05.
