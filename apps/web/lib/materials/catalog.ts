/**
 * Materials catalog learn helpers — upsert last/avg paid from receipt lines.
 * Spec: docs/superpowers/specs/2026-07-31-materials-catalog-receipt-learning-design.md
 */
import type { PoolClient } from "pg";

export type CatalogLineInput = {
  name: string;
  unit_cost_cents: number;
  sku?: string | null;
  quantity?: number;
  unit?: string;
};

export type CatalogLearnContext = {
  accountId: string;
  supplier?: string | null;
  purchasedAt?: string | null; // YYYY-MM-DD
  category?: string;
};

export type MaterialsPriceBookRow = {
  id: string;
  account_id: string;
  name: string;
  brand: string | null;
  category: string;
  unit: string;
  unit_cost_cents: number;
  supplier: string | null;
  sku: string | null;
  last_purchased_at: string | null;
  notes: string | null;
  is_active: boolean;
  avg_paid_cents: number | null;
  purchase_count: number;
};

/** Running average after incorporating one new unit cost. */
export function computeRunningAverage(
  prevAvgCents: number | null | undefined,
  prevCount: number,
  newCostCents: number,
): { avg_paid_cents: number; purchase_count: number } {
  const cost = Math.round(newCostCents);
  if (prevCount <= 0 || prevAvgCents == null || prevAvgCents < 0) {
    return { avg_paid_cents: cost, purchase_count: 1 };
  }
  const nextCount = prevCount + 1;
  const avg = Math.round((prevAvgCents * prevCount + cost) / nextCount);
  return { avg_paid_cents: avg, purchase_count: nextCount };
}

function normalizeSku(sku: string | null | undefined): string | null {
  const s = sku?.trim() ?? "";
  return s.length > 0 ? s : null;
}

function normalizeName(name: string): string {
  return name.trim();
}

const VALID_CATEGORIES = new Set([
  "paint",
  "lumber",
  "hardware",
  "concrete",
  "fasteners",
  "sheet_goods",
  "trim",
  "flooring",
  "other",
]);

function normalizeCategory(category?: string): string {
  if (category && VALID_CATEGORIES.has(category)) return category;
  return "other";
}

/**
 * Upsert a single catalog row from a purchase observation.
 * Match: SKU first (active rows), else lower(name)+unit.
 */
export async function upsertMaterialFromPurchase(
  client: PoolClient,
  ctx: CatalogLearnContext,
  line: CatalogLineInput,
): Promise<MaterialsPriceBookRow | null> {
  const name = normalizeName(line.name);
  const unitCost = Math.round(line.unit_cost_cents);
  if (!name || unitCost <= 0) return null;

  const sku = normalizeSku(line.sku);
  const unit = (line.unit?.trim() || "each").slice(0, 50);
  const category = normalizeCategory(ctx.category);
  const supplier = ctx.supplier?.trim() || null;
  const purchasedAt = ctx.purchasedAt?.slice(0, 10) || null;

  let existing: MaterialsPriceBookRow | null = null;

  if (sku) {
    const bySku = await client.query<MaterialsPriceBookRow>(
      `SELECT id, account_id, name, brand, category, unit, unit_cost_cents, supplier, sku,
              last_purchased_at::text AS last_purchased_at, notes, is_active,
              avg_paid_cents, purchase_count
       FROM materials_price_book
       WHERE account_id = $1
         AND is_active = true
         AND sku IS NOT NULL
         AND lower(btrim(sku)) = lower(btrim($2))
       LIMIT 1`,
      [ctx.accountId, sku],
    );
    existing = bySku.rows[0] ?? null;
  }

  if (!existing) {
    const byName = await client.query<MaterialsPriceBookRow>(
      `SELECT id, account_id, name, brand, category, unit, unit_cost_cents, supplier, sku,
              last_purchased_at::text AS last_purchased_at, notes, is_active,
              avg_paid_cents, purchase_count
       FROM materials_price_book
       WHERE account_id = $1
         AND is_active = true
         AND lower(btrim(name)) = lower(btrim($2))
         AND unit = $3
       LIMIT 1`,
      [ctx.accountId, name, unit],
    );
    existing = byName.rows[0] ?? null;
  }

  if (existing) {
    const { avg_paid_cents, purchase_count } = computeRunningAverage(
      existing.avg_paid_cents,
      existing.purchase_count,
      unitCost,
    );
    const updated = await client.query<MaterialsPriceBookRow>(
      `UPDATE materials_price_book SET
         unit_cost_cents   = $2,
         avg_paid_cents    = $3,
         purchase_count    = $4,
         sku               = COALESCE(NULLIF(btrim($5), ''), sku),
         supplier          = COALESCE($6, supplier),
         last_purchased_at = COALESCE($7::date, last_purchased_at),
         name              = CASE
                               WHEN length(btrim($8)) > length(btrim(name)) THEN btrim($8)
                               ELSE name
                             END,
         updated_at        = now()
       WHERE id = $1 AND account_id = $9
       RETURNING id, account_id, name, brand, category, unit, unit_cost_cents, supplier, sku,
                 last_purchased_at::text AS last_purchased_at, notes, is_active,
                 avg_paid_cents, purchase_count`,
      [
        existing.id,
        unitCost,
        avg_paid_cents,
        purchase_count,
        sku,
        supplier,
        purchasedAt,
        name,
        ctx.accountId,
      ],
    );
    return updated.rows[0] ?? null;
  }

  const inserted = await client.query<MaterialsPriceBookRow>(
    `INSERT INTO materials_price_book
       (account_id, name, category, unit, unit_cost_cents, supplier, sku,
        last_purchased_at, avg_paid_cents, purchase_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $5, 1)
     RETURNING id, account_id, name, brand, category, unit, unit_cost_cents, supplier, sku,
               last_purchased_at::text AS last_purchased_at, notes, is_active,
               avg_paid_cents, purchase_count`,
    [ctx.accountId, name, category, unit, unitCost, supplier, sku, purchasedAt],
  );
  return inserted.rows[0] ?? null;
}

/**
 * Learn catalog prices from a batch of expense line items.
 * Returns how many rows were upserted (skips invalid lines).
 */
export async function learnMaterialsFromLineItems(
  client: PoolClient,
  ctx: CatalogLearnContext,
  lines: CatalogLineInput[],
): Promise<{ learned: number }> {
  let learned = 0;
  for (const line of lines) {
    const row = await upsertMaterialFromPurchase(client, ctx, line);
    if (row) learned += 1;
  }
  return { learned };
}
