# Materials Catalog — Barcode/SKU + Receipt Learning — Design Spec

**Date:** 2026-07-31  
**Status:** Approved (2026-07-31)  
**Roadmap:** Phase 3 — Estimate & Billing Closure  
**Epic:** EPIC-004 Billing & Profitability  
**Tasks:** TASK-085 … TASK-088  

---

## Problem

Dovetails buys materials constantly (Home Depot, Lowe’s, etc.). Receipts already itemize with SKUs via AI scan and `expense_line_items`, but nothing turns those lines into a durable “what did we last pay for this SKU?” catalog. Estimating and job pricing still rely on memory or market guesses.

### Already shipped (out of scope to rebuild)

- Receipt scan → line items + optional `sku`
- Job Materials panel + margin from linked materials receipts
- `materials_price_book` table + `/api/v1/materials` CRUD (no product surface)
- Service labor catalog at `/app/price-book` (different domain)

### Gap

No learn path from receipts → catalog, no last/average stats, no materials catalog UI, no import of existing Home Depot purchase history.

---

## Goals

1. Persistent materials catalog: name, SKU/barcode, supplier, **last paid**, **average paid**, **purchase count**, last purchased date.
2. Auto-learn when materials expense line items are saved (scan-create path or line-items PUT).
3. Browse/search/edit at `/app/materials` (owner/admin manage; tech may view if linked from settings later).
4. One-time import of Home Depot purchase history CSV already in-repo.
5. Catalog is the reference for “what things cost”; job spend remains on expenses/receipts.

## Non-goals (v1)

- Full per-purchase observation history table
- Auto-fill estimate material lines from the catalog
- Replacing the service Price Book (`/app/price-book`)
- Multi-vendor barcode normalization beyond storing the SKU string as printed
- Blocking receipt capture if catalog learn fails

---

## Decision summary

| Topic | Decision |
|---|---|
| Approach | Extend `materials_price_book` (Approach A) |
| Price model | Last paid + rolling average + purchase_count |
| Last-paid column | Reuse `unit_cost_cents` as last paid (single source of truth) |
| Match order | SKU/barcode first; else lower(name)+unit |
| Learn trigger | After successful line-item save for `category = 'materials'` |
| Learn failures | Non-fatal: log and continue |
| purchase_count | Count of learn events (re-saves may increment) — good enough for pricing |
| Manual price edit | Updates last paid only; leaves avg and count unchanged |
| UI entry | Settings → Materials Catalog; page at `/app/materials` |
| CSV import | Owner-only API + script using existing HD export |

---

## Data model

Additive migration `162_materials_catalog_stats.sql`:

```sql
ALTER TABLE materials_price_book
  ADD COLUMN IF NOT EXISTS avg_paid_cents INT
    CHECK (avg_paid_cents IS NULL OR avg_paid_cents >= 0),
  ADD COLUMN IF NOT EXISTS purchase_count INT NOT NULL DEFAULT 0
    CHECK (purchase_count >= 0);

-- Partial unique: one active row per account+SKU
CREATE UNIQUE INDEX IF NOT EXISTS idx_mpb_account_sku
  ON materials_price_book (account_id, lower(btrim(sku)))
  WHERE sku IS NOT NULL AND btrim(sku) <> '' AND is_active = true;
```

Existing unique on `(account_id, lower(name), unit)` remains for no-SKU rows.

### Upsert / match

1. If `sku` is non-empty → find active row by `(account_id, lower(btrim(sku)))`.
2. Else → find by `(account_id, lower(btrim(name)), unit)`.
3. On match: update last paid, recompute average, increment count, refresh `last_purchased_at` / supplier / name if blank.
4. On miss: insert with `purchase_count = 1`, `avg_paid_cents = unit_cost_cents`, `unit_cost_cents = unit_cost_cents`.

### Average formula

```
if purchase_count == 0:
  avg = new_cost
  count = 1
else:
  avg = round((avg * count + new_cost) / (count + 1))
  count = count + 1
unit_cost_cents = new_cost   -- last paid
```

---

## Data flow

```
Receipt photo
  → POST /api/v1/expenses/scan-receipt   (line_items + sku)
  → POST /api/v1/expenses                (materials category)
  → PUT  /api/v1/expenses/[id]/line-items
       → replaceExpenseLineItems
       → learnMaterialsFromLineItems(...)   // non-fatal

Manual line-item edit → same PUT path → learn

CSV import (owner)
  → POST /api/v1/materials/import
       → parse HD columns → bulk learn (same upsert)
```

Learn only when the expense `category = 'materials'`.

---

## Components & files

**New**

- `db/migrations/162_materials_catalog_stats.sql`
- `apps/web/lib/materials/catalog.ts` — pure avg math + DB learn helpers
- `apps/web/lib/materials/__tests__/catalog.unit.test.ts`
- `apps/web/app/app/materials/page.tsx`
- `apps/web/app/app/materials/MaterialsCatalogClient.tsx`
- `apps/web/app/api/v1/materials/import/route.ts`
- Optional: `scripts/import-hd-purchase-history.ts`

**Modified**

- `apps/web/app/api/v1/materials/route.ts` — return avg/count; search by SKU
- `apps/web/app/api/v1/materials/[id]/route.ts` — expose new fields
- `apps/web/app/api/v1/expenses/[id]/line-items/route.ts` — call learn after save
- `apps/web/app/app/settings/SettingsTabsClient.tsx` — Materials Catalog link
- `apps/web/lib/expenses/receipt-line-items.ts` — emphasize barcode/SKU in prompt if needed

---

## UI

`/app/materials` (owner/admin):

- Search: name or SKU
- Filters: category, supplier
- Rows: Name · SKU · Last · Avg · ×N · Last bought · Supplier
- Edit: name, category, unit, notes, last price (manual), deactivate
- Banner: prices update automatically from materials receipts
- Empty: CTA upload receipt + import purchase history

Settings business links: add “Materials Catalog” next to Price Book / Expenses.

---

## Error handling

- Learn throw → catch, log with `traceId`, do not fail the line-items response
- Import: skip bad rows; return `{ imported, skipped, errors[] }`
- Validation: unit cost > 0 to learn; blank name skipped

---

## Testing

- Unit: average math edge cases (first purchase, second, large counts)
- Unit: match order (SKU beats name; no-SKU name path)
- Unit: materials-only filter (caller responsibility — expense category check)
- Gate: `pnpm gate:fast` before merge

---

## Backlog mapping

| Task | Deliverable |
|------|-------------|
| TASK-085 | Migration + domain/API fields for avg/count/SKU index |
| TASK-086 | Learn path from line-items save |
| TASK-087 | Catalog UI + SKU search |
| TASK-088 | HD purchase history import |

Follow-up (not v1): estimate material lines look up catalog prices (future task).

---

## Deploy

1. Merge to main after CI green  
2. Deploy garonhome compose + run migrations  
3. Owner runs import once (or ops runs script against the CSV)
