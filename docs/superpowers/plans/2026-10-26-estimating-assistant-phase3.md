# Estimating Assistant, Phase 3 Slice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every material price on a quote carries its source, date and an evidence-based confidence label; purchase imports never double-count; paint and primer quantities and prices come from measurements and real purchases.

**Architecture:** An append-only `price_observations` ledger is the price truth; `materials_price_book` rows become product variants (store family + SKU) whose price fields are a cache recomputed from the ledger. Pure rules (price selection, confidence, package-size parsing, paint quantity) live in `packages/domain`; database and import code in `apps/web/lib`. Imports reuse the store purchase importer in `apps/web/lib/expenses/import/`.

**Tech Stack:** TypeScript, Next.js app router, PostgreSQL with RLS (`app_account_id()`, `app_role()`), node-postgres `PoolClient`, Zod, Vitest, Playwright, pnpm workspaces.

**Spec:** `docs/working/estimating-assistant-phase3.md` (approved 2026-10-26; owner decisions D1–D11, eng decisions E1–E10, correction passes). Backlog: TASK-209 to TASK-216.

## Start gate

This plan is Track C of `docs/working/build-runbook.md`; the runbook's operating rules (merge gates, deploy, progress, handoff) apply to every task here.

Do not start Task 1 until all are true:

1. PR #720's formula document (`docs/working/hourly-baseline.md`) is approved by the owner.
2. PR #720 is merged, then PR #721.
3. TASK-190 (materials `unit_cost_cents`), TASK-191 (line and estimate hours) and TASK-194 (send checklist, `direct_costs_confirmed_at`, `baseline_snapshot`) are implemented on main. Tasks below name their exact dependency.

The owner's 24-month Pro Xtra export is not a gate: every test uses fixture CSVs.

## Global Constraints

- Migrations: additive and reversible, next free number at implementation time (expected 210 onward, after #720's 208/209), header comment plus a `-- Reversal:` block, same style as `db/migrations/206_deposit_request_delivery.sql`.
- Every new account table: `ENABLE` and `FORCE ROW LEVEL SECURITY`; select `account_id = app_account_id()`; insert/update `app_role() IN ('owner', 'admin')`. `node scripts/check-rls-coverage.mjs` must pass.
- Money in integer cents; round once at the end with `Math.round`.
- No new paid service or subscription.
- Confidence labels exactly: `high`, `medium`, `low`, `unverified`; reasons in plain words, e.g. `Medium: purchased 140 days ago`.
- Starting thresholds (editable): High within 90 days, Medium within 365 days, quote validity default 30 days.
- Paint defaults: finish coverage 350 sq ft/gal labeled "default"; primer default 250 sq ft/gal (drywall substrate only), labeled "default"; waste default 10% labeled "default, not yet checked against your jobs"; explicit 0% is a value, `null` means default.
- Store families exactly: `home_depot`, `lowes`, `other` (reuse `vendorFamily()` in `apps/web/lib/expenses/duplicate-match.ts`).
- Delete what you replace (knip gate): the running-average code in `apps/web/lib/materials/catalog.ts`, `apps/web/lib/materials/hd-import.ts` and `apps/web/app/api/v1/materials/import/route.ts`.
- Tests: domain `pnpm --filter @ai-fsm/domain test:unit`; web `pnpm --filter @ai-fsm/web test:unit`; integration `pnpm --filter @ai-fsm/web test:integration` (needs `TEST_DATABASE_URL`). Run `pnpm gate:fast` before each PR. Do not run a build while a local dev server is running.

## Review Focus

1. A Pro Xtra export whose header lacks "Store Number" or "Transaction ID": rows become review records with reason "no transaction identity", never auto-counted (Task 2).
2. The same SKU number at Home Depot and Lowe's: two variants, never merged (Task 1).
3. A receipt re-parsed while a second re-parse is running: one current revision, no duplicate observations (Task 2).
4. A quote line whose only evidence is a sale purchase 400 days old: label `low`, reason names both "sale" and the age (Task 3).
5. A paint group with one surface of unknown coverage and one known: the line asks for the missing coverage instead of using 350 for it (Task 5).

---

## File Structure

| File | Responsibility |
| --- | --- |
| `db/migrations/2NN_price_observations.sql` | Ledger table, variant uniqueness, catalog package columns, RLS |
| `db/migrations/2NN_purchase_import_reviews.sql` | Review records for both import modes; parse revisions on receipts |
| `db/migrations/2NN_price_confidence_settings.sql` | Threshold columns on `business_pricing_settings` |
| `db/migrations/2NN_pilot_actions.sql` | Pilot manual-action log |
| `packages/domain/src/price-evidence.ts` | Types, price selection, confidence (pure) |
| `packages/domain/src/package-size.ts` | Package-size parser (pure) |
| `packages/domain/src/production-takeoff/paint.ts` | `paintQuantity`, grouping (pure) |
| `apps/web/lib/materials/ledger.ts` | Write observations, recompute variant cache |
| `apps/web/lib/expenses/import/identity.ts` | Transaction identity and observation keys |
| `apps/web/lib/expenses/import/reviews.ts` | Review records: create, confirm, dismiss, reopen |
| `apps/web/lib/jobs/hours-comparison.ts` | Estimated vs actual hours (pure) |

---

### Task 1: Price observation ledger and catalog cache (TASK-210)

**Depends on:** TASK-190.

**Files:**
- Create: `db/migrations/2NN_price_observations.sql`
- Create: `packages/domain/src/price-evidence.ts` (types only in this task), export from `packages/domain/src/index.ts`
- Create: `apps/web/lib/materials/ledger.ts`
- Create: `scripts/backfill-price-observations.mjs`
- Modify: `apps/web/lib/materials/catalog.ts` (remove `computeRunningAverage`, `shouldUpdateLastPaid`; `upsertMaterialFromPurchase` keyed by store family + SKU, writes through the ledger)
- Modify: `apps/web/app/api/v1/materials/[id]/route.ts` (price edits require `observed_price_cents` + `source`; become `manual_check`)
- Test: `apps/web/lib/materials/__tests__/ledger.unit.test.ts`, `apps/web/lib/materials/__tests__/ledger.integration.test.ts`, update `catalog.unit.test.ts`

**Interfaces:**
- Produces (domain):
  - `type ObservationKind = "receipt" | "supplier_csv" | "supplier_quote" | "manual_check" | "catalog_summary" | "ai_allowance"`
  - `type StoreFamily = "home_depot" | "lowes" | "other"`
  - `type ObservationStatus = "active" | "pending" | "superseded" | "dismissed"`
  - `interface PriceObservation { id: string; variantId: string; kind: ObservationKind; observedOn: string /*YYYY-MM-DD*/; unitPriceCents: number; storeFamily: StoreFamily; storeNumber: string | null; location: string | null; isSale: boolean; reconciled: boolean; expiresOn: string | null; quoteQuantity: number | null; status: ObservationStatus; sourceRef: string; }`
- Produces (web):
  - `recordObservations(client: PoolClient, accountId: string, rows: NewObservation[]): Promise<{ inserted: number; duplicates: number }>` — `NewObservation` = `PriceObservation` minus `id`/`status` plus `dedupeKey: string`; `ON CONFLICT (account_id, dedupe_key) DO NOTHING`; recomputes each touched variant once, in the caller's transaction, after `SELECT pg_advisory_xact_lock(hashtext(variant_id::text))`.
  - `recomputeVariantCache(client: PoolClient, accountId: string, variantId: string): Promise<void>` — sets `unit_cost_cents`, `avg_paid_cents`, `purchase_count`, `last_purchased_at` from active non-summary, non-sale observations; summaries never counted.

- [ ] **Step 1: Write failing unit tests** — `ledger.unit.test.ts`:
  - `recomputes average and count without catalog_summary rows` (summary $9.99 + receipts $10.00, $12.00 → avg 1100, count 2)
  - `a summary dated after the newest real observation stays the latest price but is not counted`
  - `a sale observation is not counted in the regular average`
- [ ] **Step 2: Run** `pnpm --filter @ai-fsm/web test:unit -- ledger` — expect FAIL (module missing).
- [ ] **Step 3: Write the migration** — table `price_observations` (columns per the interface, plus `account_id`, `dedupe_key text not null`, `entered_by uuid`, `note text`, `voided_at timestamptz`, `created_at`); `UNIQUE (account_id, dedupe_key)`; index `(account_id, variant_id, observed_on desc)`; CHECK on kind; on `materials_price_book` add `store_family text`, `package_qty numeric`, `package_unit text`, `package_source text CHECK IN ('description','owner')`, `same_product_group uuid`; unique index `(account_id, store_family, lower(btrim(sku))) WHERE sku IS NOT NULL AND is_active`; RLS as Global Constraints.
- [ ] **Step 4: Implement `ledger.ts`** and route catalog writers through it.
- [ ] **Step 5: Integration test** — `ledger.integration.test.ts`:
  - `concurrent recordObservations on one variant leave a consistent cache` (two clients, same variant, final count = total rows)
  - `catalog PATCH without source returns 422`
  - `same sku at home_depot and lowes creates two variants`
- [ ] **Step 6: Backfill script** — receipts (`expense_line_items` with materials expenses) → `receipt` observations keyed `receipt:{expense_id}:{rev}:{fingerprint}`; each catalog row → one `catalog_summary` keyed `summary:{variant_id}`. Test: `backfill twice yields identical ledger` (integration).
- [ ] **Step 7: Run** unit + integration + `node scripts/check-rls-coverage.mjs` — expect PASS.
- [ ] **Step 8: Commit** `feat(materials): price observation ledger and catalog cache (TASK-210)`.

---

### Task 2: Duplicate-safe purchase imports (TASK-211)

**Depends on:** Task 1.

**Files:**
- Create: `db/migrations/2NN_purchase_import_reviews.sql`
- Create: `apps/web/lib/expenses/import/identity.ts`, `apps/web/lib/expenses/import/reviews.ts`
- Modify: `apps/web/lib/expenses/import/homedepot.ts` (parse "Store Number"; `ImportTransaction.store_number: string | null`), `lowes.ts` (store field if present, else `null`)
- Modify: `apps/web/lib/expenses/duplicate-match.ts` (replace `csvImportStatus` with `classifyTrip`)
- Modify: `apps/web/app/api/v1/expenses/import/preview/route.ts`, `commit/route.ts` (body `mode: "history" | "book"`), `apps/web/app/app/expenses/import/ImportExpensesClient.tsx` (mode picker, pending list, Same/Different/Dismiss/Reopen, Confirm selected, pending count and value)
- Modify: `apps/web/lib/expenses/receipt-line-items.ts` (keep signed return/discount lines; `reconcileReceiptParse` accounts for tax, receipt discounts, coupons, returns), `apps/web/lib/expenses/line-items.ts` (parse revision number)
- Delete: `apps/web/lib/materials/hd-import.ts`, `apps/web/app/api/v1/materials/import/route.ts`, its test; point the catalog import button to `/app/expenses/import`
- Test: `apps/web/lib/expenses/__tests__/identity.unit.test.ts`, `reviews.integration.test.ts`, update `duplicate-match.unit.test.ts`, `homedepot-import.unit.test.ts`, `receipt-line-items.unit.test.ts`; fixtures `apps/web/lib/expenses/__tests__/fixtures/hd-24-month.csv`, `hd-no-store.csv`, `lowes-sample.csv`

**Interfaces:**
- Consumes: `recordObservations` (Task 1).
- Produces:
  - `transactionIdentity(t: { vendor: string; store_number: string | null; external_ref: string | null }): string | null` → `"home_depot:4719:<txn>"`; `null` when store or transaction is missing.
  - `observationKey(identity: string, sku: string | null, quantity: number, netUnitCents: number, occurrence: number): string`
  - `classifyTrip(candidate: TripFingerprint, existing: TripFingerprint[]): { status: "new" | "already_imported" | "auto_link" | "review"; reason?: "possible_duplicate" | "conflicting_transaction_id" | "no_transaction_identity"; matchId?: string }` — `auto_link` only when family, store, date and transaction ID all match; same transaction ID with any of supplier, store, date or total different → `review` / `conflicting_transaction_id`.
  - `createReview(client, accountId, r: { mode: "history" | "book"; identityKey: string; payload: unknown; valueCents: number; reason: string }): Promise<string>` (idempotent on `(account_id, mode, identity_key)`)
  - `confirmReview(client, session, id, decision: "same" | "different"): Promise<void>` — one transaction; book mode `different` creates expense + line items + observations; `same` attaches; history mode makes observations active or records the duplicate; never an expense in history mode.
  - `dismissReview(client, session, id, reason: string)`, `reopenReview(client, session, id)` — audit-logged.
  - `pendingSummary(client, accountId): Promise<{ count: number; valueCents: number }>`

- [ ] **Step 1: Failing tests** — `identity.unit.test.ts`:
  - `identity requires store and transaction` (`hd-no-store.csv` rows → `null`)
  - `identical lines in one transaction get occurrence 1 and 2`
  - `same transaction id at another store is conflicting_transaction_id`
  - `exact store+date+amount without transaction id is review possible_duplicate` (regression: was auto-matched)
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Migration** — table `purchase_import_reviews` (`id, account_id, mode, identity_key, reason, payload jsonb, value_cents, status CHECK IN ('pending','resolved_same','resolved_different','dismissed'), dismiss_reason, created_by, resolved_by, resolved_at, created_at`), unique `(account_id, mode, identity_key)`, RLS; `expenses.parse_revision int not null default 1`.
- [ ] **Step 4: Implement** identity, classifier, reviews, both modes in commit. History mode writes observations with `status = 'active'` for new rows and `'pending'` for rows under review; it never inserts `expenses`. Also:
  - `isSale` from `ImportLineItem.discounted`; receipt markdown lines set `isSale`.
  - `reconciled` on receipt observations from the updated `reconcileReceiptParse`.
  - Reject list with line number and reason (`bad_date`, `bad_price`, `return`, `zero_line`, `duplicate`, `conflicting_transaction_id`, `no_transaction_identity`); limits 5 MB and 20,000 rows (413 / 422 with a plain message).
  - Import report `{ mode, rowsRead, imported, alreadyImported, pending, rejected }` written with `appendAuditLog`.
  - `pendingSummary` shown on the import screen and the expenses page ("4 trips pending review, $612.40").
- [ ] **Step 5: Integration tests** — `reviews.integration.test.ts`:
  - `history import books no expenses and leaves job cost unchanged`
  - `history then book import of one transaction adds expenses but no new observations`
  - `re-import at fixed evaluation date leaves observations and confidence unchanged`
  - `re-import does not duplicate a pending review`
  - `confirm with a forced failure leaves the review pending and nothing booked` (throw inside the transaction)
  - `dismissed review excluded from evidence; reopen returns it to pending`
  - `two concurrent receipt re-parses produce one current revision`
- [ ] **Step 6: Run** all expense tests + `pnpm gate:fast` — expect PASS; knip passes with the deleted files.
- [ ] **Step 7: Commit** `feat(expenses): duplicate-safe purchase imports with history mode (TASK-211)`.

---

### Task 3: Package sizes (TASK-212)

**Depends on:** Task 1.

**Files:**
- Create: `packages/domain/src/package-size.ts`, test `packages/domain/src/__tests__/package-size.unit.test.ts`
- Modify: `apps/web/lib/materials/catalog.ts` (apply clear parses with `package_source = 'description'`), `apps/web/app/api/v1/materials/[id]/route.ts` (owner sets size, `package_source = 'owner'`), `apps/web/app/app/materials/MaterialsCatalogClient.tsx` ("Missing package size" filter), estimate line UI component for the inline control

**Interfaces:**
- Produces: `parsePackageSize(description: string): { qty: number; unit: "gal" | "qt" | "oz" | "fl_oz" | "ft" | "lf" | "sqft" | "each"; certainty: "clear" | "suggested" } | null`; `needsPackageSize(line: { conversionRequired: boolean; isEach: boolean; verifiedDirectCost: boolean; packageQty: number | null }): boolean`.

- [ ] **Step 1: Failing tests** — `"Behr Ultra 5 Gal. Eggshell"` → `{qty:5, unit:"gal", certainty:"clear"}`; `"1 qt"` → qt clear; `"10.1 oz Caulk"` → oz clear; `"50 ft Tape"` → ft clear; `"Primer 1 Gal. or 5 Gal."` → `suggested`; `"Hinge"` → `null`; `needsPackageSize` false for each items and verified direct costs.
- [ ] **Step 2: Run** `pnpm --filter @ai-fsm/domain test:unit -- package-size` — FAIL.
- [ ] **Step 3: Implement** with regexes over the description; ambiguity (two sizes) → `suggested`.
- [ ] **Step 4: Inline control** — "Package size needed: [size] Save for this product" pre-filled with the suggestion, saved only on Save; send checklist row (TASK-194) uses `needsPackageSize`. Messages follow the spec's "Missing-data messages" format: what, why, link to fix, honest exit ("Each item, no package"); blocking rows styled apart from review notes.
- [ ] **Step 5: Run** tests + `pnpm gate:fast` — PASS.
- [ ] **Step 6: Commit** `feat(materials): package sizes and inline resolution (TASK-212)`.

---

### Task 4: Price selection and confidence (TASK-213)

**Depends on:** Task 1, TASK-194.

**Files:**
- Modify: `packages/domain/src/price-evidence.ts`; test `packages/domain/src/__tests__/price-evidence.unit.test.ts`
- Create: `db/migrations/2NN_price_confidence_settings.sql` (`price_high_days int default 90`, `price_medium_days int default 365`, `quote_valid_days int default 30`)
- Modify: estimate line rendering (label + reason), send freeze (TASK-194's `baseline_snapshot` gains per-line `{label, reason, observationId}`), materials UI "Verified today" and "Add supplier quote" forms, Settings pricing form

**Interfaces:**
- Produces:
  - `selectLinePrice(obs: PriceObservation[], ctx: { variantId: string; storeFamily: StoreFamily; storeNumber: string | null; quantity: number; asOf: string }): { observation: PriceObservation; saleOnly: boolean; alsoOnSale: PriceObservation | null } | null` — valid quote for the quantity wins; else newest active regular-price observation; summary only if no real observation is at least as recent; sale only when no regular exists.
  - `assessConfidence(sel: ReturnType<typeof selectLinePrice>, ctx: { storeFamily: StoreFamily; storeNumber: string | null; asOf: string }, t: { highDays: number; mediumDays: number; quoteValidDays: number }): { label: "high" | "medium" | "low" | "unverified"; reason: string }`

- [ ] **Step 1: Failing tests** (all with `asOf: "2026-11-01"`):
  - `receipt 12 days old, same store → high`
  - `receipt 140 days old → medium "purchased 140 days ago"`
  - `receipt 400 days old at another store → low` (mismatch never raises)
  - `ai_allowance at another store → unverified`
  - `valid quote for exact quantity → high; expired → low "quote expired"`
  - `catalog_summary only → low`
  - `unreconciled receipt 5 days old → low`
  - `sale-only evidence → at most medium, reason says "only bought on sale"`
  - `regular and newer sale → regular chosen, alsoOnSale set`
  - `unknown location never counts as a match`
  - `sale-only receipt 400 days old → low, reason names sale and age` (Review Focus 4)
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement**; mismatch lowers one level after the base label, floor at the base for `low` and `unverified`.
- [ ] **Step 4: Forms** — Verified today requires `observed_price_cents`, `source` (`store_shelf | website | phone_quote | written_quote`), `location`; refuses without; creates `manual_check`. Supplier quote requires item, quantity, location, price, quote date; expiry optional (default from settings).
- [ ] **Step 5: Integration test** — `sent quote keeps label and reason after a newer price arrives`.
- [ ] **Step 6: Run** + `pnpm gate:fast` — PASS. **Commit** `feat(estimates): price selection and confidence with reasons (TASK-213)`.

---

### Task 5: Paint pilot (TASK-214)

**Depends on:** Tasks 3 and 4, TASK-190.

**Files:**
- Create: `packages/domain/src/production-takeoff/paint.ts`; export from `production-takeoff/index.ts`; test `packages/domain/src/production-takeoff/paint.test.ts`
- Modify: `packages/domain/src/painting.ts` (`wallPaintGallons` and `computeRoomPainting` call `paintQuantity`), `packages/domain/src/estimate-engine/painting.ts` (gallons via `paintQuantity`), `apps/web/lib/estimates/prepare-quote.ts:211-213` (stop `PAINT_CENTS_PER_GALLON`; price from chosen variant via `selectLinePrice`), prepared-scope materials lines (store formula inputs), `apps/web/lib/estimates/materials-generator.ts` (formula-covered items take formula quantity; no second waste)
- Create: `db/migrations/2NN_pilot_actions.sql` (`pilot_actions`: `estimate_id, line_ref, kind CHECK IN ('override_correction','override_preference','product_link','mapping_confirm','package_size','coverage_edit'), created_by, created_at`, RLS)
- Test: update `apps/web/lib/estimates/__tests__/prepare-quote.unit.test.ts`, engine parity tests

**Interfaces:**
- Produces:
  - `paintQuantity(g: { surfaces: { areaSqft: number; coats: number; coverageSqftPerGal: number | null }[]; defaultCoverage: number | null; wastePct: number | null; packageGal: number | null }): { gallonsNeeded: number | null; gallonsWithWaste: number | null; packages: number | null; leftoverGal: number | null; missing: ("coverage" | "package_size" | "area")[] }` — per surface `area × coats / (coverage ?? defaultCoverage)`; any surface with neither → `missing: ["coverage"]`, no total; `wastePct null` → 10, `0` → 0; round once.
  - `groupPaintLines(lines: { variantId: string; tint: string; sheen: string; application: string }[]): string[][]` — group key is all four.
  - `PRIMER_DEFAULT_COVERAGE: Partial<Record<"drywall" | "wood" | "masonry" | "metal", number>> = { drywall: 250 }`

- [ ] **Step 1: Failing tests** — `paint.test.ts`:
  - `2.6 gal need with 1-gal package → 3 packages, leftover 0.4` (use surfaces giving exactly 2.6 after 10% waste)
  - `two surfaces 350 and 250 coverage computed per surface before waste`
  - `explicit 0% waste gives no waste; null uses 10%`
  - `primer on wood with no product coverage → missing coverage` (never 350)
  - `different sheen → different group`
  - `350 sq ft, 2 coats, default coverage → 3 gal` (wall rule unchanged)
  - `one surface with unknown coverage and no default → missing coverage, no total` (Review Focus 5)
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement**; switch callers; list every changed engine fixture result in the PR description.
- [ ] **Step 4: Prepare Quote tests** — `paint priced from chosen variant and ledger`, `no product chosen shows "Choose a paint product"`, `PAINT_CENTS_PER_GALLON not used for prepared quotes`.
- [ ] **Step 5: Recalculation + overrides** — formula inputs stored on the line; changing a measurement recalculates and clears `direct_costs_confirmed_at` and the cost-floor acknowledgment; owner override kept, labeled "owner override", requires kind (`correction` / `preference`) and logs a `pilot_actions` row. Test: `measurement change clears cost confirmation`; `override is not recalculated`.
- [ ] **Step 6: Log** product links, mapping confirmations, package-size saves and coverage edits to `pilot_actions`; add a read-only pilot summary query (per estimate: counts by kind) for the owner.
- [ ] **Step 7: Run** domain + web tests, `pnpm gate:fast`; E2E: assessment → Prepare Quote → paint line with label → send. **Commit** `feat(estimates): paint pilot with one paint rule and real prices (TASK-214)`.

---

### Task 6: Estimated vs actual hours (TASK-215)

**Depends on:** TASK-191.

**Files:**
- Create: `apps/web/lib/jobs/hours-comparison.ts`; test `apps/web/lib/jobs/__tests__/hours-comparison.unit.test.ts`
- Modify: `apps/web/app/app/jobs/[id]/page.tsx` (reuse the existing linked `job_work` minutes query; add "possibly related" query for unlinked `job_work` on the job's visit days)

**Interfaces:**
- Produces: `compareHours(est: { work: { low: number; high: number } | null; travel: { low: number; high: number } | null }, actual: { workLinkedHours: number; possiblyRelatedHours: number; travelLinked: false }): { work: { estimatedMid: number | null; actual: number; differenceHours: number | null } ; travel: { estimatedMid: number | null; actual: "not_available" }; possiblyRelatedHours: number; included: string[]; excluded: string[] }`

- [ ] **Step 1: Failing tests** — `difference uses work hours only`; `travel estimate shown, actual not_available, excluded from difference`; `no estimate → differenceHours null`; `possibly related hours never added to actual`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Render** with the included/excluded lists and the "work hours only" label.
- [ ] **Step 5: Run** + `pnpm gate:fast` — PASS. **Commit** `feat(jobs): estimated vs actual hours within matching categories (TASK-215)`.

---

### Task 7: Follow-up formula families (TASK-216) — gated

Not planned in detail. Starts only after the owner confirms the pilot success criteria in the spec (section 7) are met; plan it then from the pilot's `pilot_actions` data.

## After deploy

- Owner imports the 24-month Pro Xtra export in **Price history only** mode and resolves review records.
- Pilot runs on at least 5 varied real jobs; the owner reviews the `pilot_actions` summary against the criteria.
