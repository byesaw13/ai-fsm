/**
 * Price observation ledger (TASK-210; docs/working/estimating-assistant-phase3.md §1–2).
 *
 * price_observations is the price truth. A catalog row (materials_price_book) is a
 * product variant — one per account, store family and SKU — and its price columns
 * are a cache. Every writer records observations here; recomputeVariantCache
 * rewrites the cache under a per-variant lock in the caller's transaction.
 */
import type { PoolClient } from "pg";
import {
  PURCHASE_KINDS,
  storeFamilyOf,
  type ObservationKind,
  type ObservationStatus,
  type StoreFamily,
} from "@ai-fsm/domain";

export interface NewObservation {
  variantId: string;
  kind: ObservationKind;
  /** YYYY-MM-DD */
  observedOn: string;
  unitPriceCents: number;
  storeFamily: StoreFamily;
  storeNumber?: string | null;
  location?: string | null;
  isSale?: boolean;
  reconciled?: boolean;
  expiresOn?: string | null;
  quoteQuantity?: number | null;
  status?: ObservationStatus;
  sourceRef: string;
  dedupeKey: string;
  enteredBy?: string | null;
  note?: string | null;
}

/** The fields the cache rule reads. */
export interface CacheObservation {
  id: string;
  kind: ObservationKind;
  observedOn: string;
  unitPriceCents: number;
  isSale: boolean;
  status: ObservationStatus;
  createdAt: string;
}

export interface VariantCache {
  /** Latest price: newest regular (non-sale) evidence, else newest sale evidence. Null = no evidence. */
  unitCostCents: number | null;
  /** Mean of real, regular purchases. Summaries never count. */
  avgPaidCents: number | null;
  purchaseCount: number;
  /** Newest purchase date, summaries included (a summary carries its item's last purchase date). */
  lastPurchasedAt: string | null;
  /** Summaries displaced by a real, regular observation dated on or after them. */
  supersededSummaryIds: string[];
}

const PRICE_KINDS: readonly ObservationKind[] = ["receipt", "supplier_csv", "manual_check", "catalog_summary", "supplier_quote"];
const DISPLACES_SUMMARY: readonly ObservationKind[] = ["receipt", "supplier_csv", "manual_check"];

/** Pure cache rule. The order of the input does not matter. */
export function variantCacheFrom(observations: CacheObservation[]): VariantCache {
  const live = observations.filter((o) => o.status === "active" || o.status === "superseded");
  const real = live.filter((o) => o.kind !== "catalog_summary" && o.status === "active");
  const summaries = live.filter((o) => o.kind === "catalog_summary");

  const supersededSummaryIds = summaries
    .filter((s) => s.status === "active")
    .filter((s) => real.some((o) => DISPLACES_SUMMARY.includes(o.kind) && !o.isSale && o.observedOn >= s.observedOn))
    .map((s) => s.id);
  const activeSummaries = summaries.filter((s) => s.status === "active" && !supersededSummaryIds.includes(s.id));

  const purchases = real.filter((o) => PURCHASE_KINDS.includes(o.kind) && !o.isSale);
  const avgPaidCents = purchases.length
    ? Math.round(purchases.reduce((sum, o) => sum + o.unitPriceCents, 0) / purchases.length)
    : null;

  const priced = [...real.filter((o) => PRICE_KINDS.includes(o.kind)), ...activeSummaries];
  // Newest first; on the same day a real observation beats a summary, then the later entry wins.
  const newest = (list: CacheObservation[]) =>
    [...list].sort((a, b) =>
      a.observedOn !== b.observedOn
        ? b.observedOn.localeCompare(a.observedOn)
        : a.kind === "catalog_summary" && b.kind !== "catalog_summary"
          ? 1
          : b.kind === "catalog_summary" && a.kind !== "catalog_summary"
            ? -1
            : b.createdAt.localeCompare(a.createdAt),
    )[0];
  const latest = newest(priced.filter((o) => !o.isSale)) ?? newest(priced);

  const purchaseDates = [
    ...real.filter((o) => PURCHASE_KINDS.includes(o.kind)),
    ...activeSummaries,
  ].map((o) => o.observedOn);

  return {
    unitCostCents: latest ? latest.unitPriceCents : null,
    avgPaidCents,
    purchaseCount: purchases.length,
    lastPurchasedAt: purchaseDates.length ? purchaseDates.sort().at(-1)! : null,
    supersededSummaryIds,
  };
}

/**
 * Stable keys for lines of one source document. Identical lines stay distinct
 * (#1, #2), and the keys do not depend on line order.
 */
export function observationFingerprints(
  lines: { sku: string | null | undefined; name: string; unitPriceCents: number; quantity: number }[],
): string[] {
  const seen = new Map<string, number>();
  return lines.map((line) => {
    const id = (line.sku?.trim() || line.name.trim()).toLowerCase();
    const base = `${id}|${Math.round(line.unitPriceCents)}|${line.quantity}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return `${base}#${n}`;
  });
}

/** Recompute one variant's cache from its ledger. Takes the per-variant lock. */
export async function recomputeVariantCache(client: PoolClient, accountId: string, variantId: string): Promise<void> {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1::text))`, [variantId]);
  const { rows } = await client.query<{
    id: string;
    kind: ObservationKind;
    observed_on: string;
    unit_price_cents: number;
    is_sale: boolean;
    status: ObservationStatus;
    created_at: string;
  }>(
    `SELECT id, kind, observed_on::text AS observed_on, unit_price_cents, is_sale, status,
            created_at::text AS created_at
     FROM price_observations
     WHERE account_id = $1 AND variant_id = $2 AND voided_at IS NULL`,
    [accountId, variantId],
  );
  const cache = variantCacheFrom(
    rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      observedOn: r.observed_on,
      unitPriceCents: r.unit_price_cents,
      isSale: r.is_sale,
      status: r.status,
      createdAt: r.created_at,
    })),
  );
  if (cache.supersededSummaryIds.length > 0) {
    await client.query(
      `UPDATE price_observations SET status = 'superseded'
       WHERE account_id = $1 AND id = ANY($2::uuid[]) AND status = 'active'`,
      [accountId, cache.supersededSummaryIds],
    );
  }
  if (cache.unitCostCents === null) return;
  await client.query(
    `UPDATE materials_price_book
     SET unit_cost_cents = $3, avg_paid_cents = $4, purchase_count = $5,
         last_purchased_at = $6::date, updated_at = now()
     WHERE id = $2 AND account_id = $1`,
    [accountId, variantId, cache.unitCostCents, cache.avgPaidCents, cache.purchaseCount, cache.lastPurchasedAt],
  );
}

/**
 * Append observations (duplicates by dedupe key are skipped) and recompute each
 * touched variant once, in the caller's transaction.
 */
export async function recordObservations(
  client: PoolClient,
  accountId: string,
  rows: NewObservation[],
): Promise<{ inserted: number; duplicates: number }> {
  let inserted = 0;
  const touched = new Set<string>();
  for (const row of rows) {
    const res = await client.query(
      `INSERT INTO price_observations
         (account_id, variant_id, kind, observed_on, unit_price_cents, store_family, store_number,
          location, is_sale, reconciled, expires_on, quote_quantity, status, source_ref, dedupe_key,
          entered_by, note)
       VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8, $9, $10, $11::date, $12, $13, $14, $15, $16, $17)
       ON CONFLICT (account_id, dedupe_key) DO NOTHING`,
      [
        accountId, row.variantId, row.kind, row.observedOn, Math.round(row.unitPriceCents), row.storeFamily,
        row.storeNumber ?? null, row.location ?? null, row.isSale ?? false, row.reconciled ?? false,
        row.expiresOn ?? null, row.quoteQuantity ?? null, row.status ?? "active", row.sourceRef,
        row.dedupeKey, row.enteredBy ?? null, row.note ?? null,
      ],
    );
    if ((res.rowCount ?? 0) > 0) {
      inserted += 1;
      touched.add(row.variantId);
    }
  }
  for (const variantId of [...touched].sort()) {
    await recomputeVariantCache(client, accountId, variantId);
  }
  return { inserted, duplicates: rows.length - inserted };
}

/**
 * A document's observations as they now stand: earlier active rows from the same
 * source that are no longer present become superseded (a re-parsed receipt).
 */
export async function replaceSourceObservations(
  client: PoolClient,
  accountId: string,
  sourceRef: string,
  rows: NewObservation[],
): Promise<{ inserted: number; duplicates: number; superseded: number }> {
  const keys = rows.map((r) => r.dedupeKey);
  const gone = await client.query<{ variant_id: string }>(
    `UPDATE price_observations SET status = 'superseded'
     WHERE account_id = $1 AND source_ref = $2 AND status = 'active'
       AND kind <> 'catalog_summary' AND NOT (dedupe_key = ANY($3::text[]))
     RETURNING variant_id`,
    [accountId, sourceRef, keys],
  );
  // A line that comes back after a re-parse is live again.
  await client.query(
    `UPDATE price_observations SET status = 'active'
     WHERE account_id = $1 AND source_ref = $2 AND status = 'superseded'
       AND kind <> 'catalog_summary' AND dedupe_key = ANY($3::text[])`,
    [accountId, sourceRef, keys],
  );
  const result = await recordObservations(client, accountId, rows);
  const extra = new Set([...gone.rows.map((r) => r.variant_id), ...rows.map((r) => r.variantId)]);
  for (const variantId of [...extra].sort()) {
    await recomputeVariantCache(client, accountId, variantId);
  }
  return { ...result, superseded: gone.rowCount ?? 0 };
}

const STORE_LABEL: Record<StoreFamily, string> = { home_depot: "Home Depot", lowes: "Lowe's", other: "other store" };

export interface VariantLookup {
  name: string;
  sku?: string | null;
  supplier?: string | null;
  unit?: string;
  category?: string;
}

const VALID_CATEGORIES = new Set([
  "paint", "lumber", "hardware", "concrete", "fasteners", "sheet_goods", "trim", "flooring", "other",
]);

/**
 * The variant for a purchased item: store family + SKU first; without a SKU, the
 * same name and unit at the same store family. Creates the variant when missing.
 * A SKU never matches across stores. A second store's item whose name is already
 * taken gets the store added to its name (the name+unit index predates variants).
 */
export async function findOrCreateVariant(
  client: PoolClient,
  accountId: string,
  item: VariantLookup,
  createdBy: string | null = null,
): Promise<{ id: string; storeFamily: StoreFamily; created: boolean } | null> {
  const name = item.name.trim();
  if (!name) return null;
  const sku = item.sku?.trim() || null;
  const unit = (item.unit?.trim() || "each").slice(0, 50);
  const family = storeFamilyOf(item.supplier);

  if (sku) {
    const bySku = await client.query<{ id: string }>(
      `SELECT id FROM materials_price_book
       WHERE account_id = $1 AND is_active = true AND store_family = $2
         AND sku IS NOT NULL AND lower(btrim(sku)) = lower(btrim($3))
       LIMIT 1`,
      [accountId, family, sku],
    );
    if (bySku.rows[0]) return { id: bySku.rows[0].id, storeFamily: family, created: false };
  } else {
    const byName = await client.query<{ id: string }>(
      `SELECT id FROM materials_price_book
       WHERE account_id = $1 AND is_active = true AND store_family = $2
         AND lower(btrim(name)) = lower(btrim($3)) AND unit = $4
       LIMIT 1`,
      [accountId, family, name, unit],
    );
    if (byName.rows[0]) return { id: byName.rows[0].id, storeFamily: family, created: false };
  }

  const taken = await client.query<{ store_family: StoreFamily; sku: string | null }>(
    `SELECT store_family, sku FROM materials_price_book
     WHERE account_id = $1 AND lower(name) = lower($2) AND unit = $3
     LIMIT 1`,
    [accountId, name, unit],
  );
  // Same name at the same store with no SKU on file: adopt it and record the SKU.
  if (taken.rows[0] && taken.rows[0].store_family === family && !taken.rows[0].sku && sku) {
    const adopted = await client.query<{ id: string }>(
      `UPDATE materials_price_book SET sku = $4, updated_at = now()
       WHERE account_id = $1 AND lower(name) = lower($2) AND unit = $3
       RETURNING id`,
      [accountId, name, unit, sku],
    );
    return { id: adopted.rows[0].id, storeFamily: family, created: false };
  }
  const variantName = taken.rows[0] ? `${name} (${STORE_LABEL[family]}${sku ? ` ${sku}` : ""})`.slice(0, 255) : name;
  const category = item.category && VALID_CATEGORIES.has(item.category) ? item.category : "other";

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO materials_price_book
       (account_id, name, category, unit, unit_cost_cents, supplier, sku, store_family, created_by)
     VALUES ($1, $2, $3, $4, 0, $5, $6, $7, $8)
     RETURNING id`,
    [accountId, variantName, category, unit, item.supplier?.trim() || null, sku, family, createdBy],
  );
  return { id: inserted.rows[0].id, storeFamily: family, created: true };
}
