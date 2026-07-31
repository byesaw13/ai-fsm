# Materials Catalog — Receipt Learning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a living materials catalog (SKU/barcode + last/avg prices) that learns from materials receipt line items, with a browse UI and Home Depot CSV import.

**Architecture:** Extend `materials_price_book` with average/count stats; centralize upsert/learn in `lib/materials/catalog.ts`; call learn after line-items save (non-fatal); surface `/app/materials` + import API. Reuse existing materials CRUD.

**Tech Stack:** Next.js App Router, PostgreSQL (`pg`), Zod, Vitest, existing `@ai-fsm/money` / UI components.

**Spec:** `docs/superpowers/specs/2026-07-31-materials-catalog-receipt-learning-design.md`  
**Backlog:** TASK-085 … TASK-088 (EPIC-004, Phase 3)

---

### Task 1: Schema migration (TASK-085)

**Files:**
- Create: `db/migrations/162_materials_catalog_stats.sql`

- [ ] Add `avg_paid_cents`, `purchase_count`, partial unique SKU index; backfill avg from unit_cost
- [ ] Commit

### Task 2: Catalog learn helper + unit tests (TASK-085/086)

**Files:**
- Create: `apps/web/lib/materials/catalog.ts`
- Create: `apps/web/lib/materials/__tests__/catalog.unit.test.ts`

- [ ] Pure `computeRunningAverage(prevAvg, prevCount, newCost)` 
- [ ] `learnMaterialsFromLineItems(client, accountId, input)` with SKU-first match
- [ ] Unit tests for math + match order (mocked client)
- [ ] Commit

### Task 3: Wire learn into line-items PUT (TASK-086)

**Files:**
- Modify: `apps/web/app/api/v1/expenses/[id]/line-items/route.ts`
- Modify: `apps/web/app/api/v1/materials/route.ts` (SKU search + new fields)
- Modify: `apps/web/app/api/v1/materials/[id]/route.ts` if needed

- [ ] After replace, if expense is materials, call learn (try/catch non-fatal)
- [ ] GET materials search matches sku ILIKE
- [ ] Commit

### Task 4: Materials catalog UI (TASK-087)

**Files:**
- Create: `apps/web/app/app/materials/page.tsx`
- Create: `apps/web/app/app/materials/MaterialsCatalogClient.tsx`
- Modify: `apps/web/app/app/settings/SettingsTabsClient.tsx`

- [ ] Server page loads catalog rows; client search/filter/edit
- [ ] Settings link
- [ ] Commit

### Task 5: HD CSV import (TASK-088)

**Files:**
- Create: `apps/web/lib/materials/hd-import.ts`
- Create: `apps/web/lib/materials/__tests__/hd-import.unit.test.ts`
- Create: `apps/web/app/api/v1/materials/import/route.ts`

- [ ] Parse HD columns; skip negatives/blank; bulk learn
- [ ] Owner-only POST
- [ ] Commit

### Task 6: Gate + PR

- [ ] `pnpm gate:fast`
- [ ] Push branch, open PR, babysit CI, merge, deploy
