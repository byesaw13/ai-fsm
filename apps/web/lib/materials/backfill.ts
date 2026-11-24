/**
 * Backfill the price ledger from existing data (TASK-210; design §2).
 *
 * 1. Every active catalog row with a price becomes one `catalog_summary`
 *    observation from its current cache (last price, last purchase date). Taken
 *    first, so later steps never change what the summary records.
 * 2. Every priced line on a materials receipt becomes a `receipt` observation of
 *    the variant it matches (store family + SKU, else same name and unit at the
 *    same store family). Keys match the live receipt path, so a later re-parse
 *    of the same lines adds nothing.
 * 3. Each variant with observations has its cache recomputed.
 *
 * Safe to run more than once: every key is deterministic. Every row written is
 * tagged `backfill:<runId>` in `note`.
 */
import type { PoolClient } from "pg";
import { storeFamilyOf, type StoreFamily } from "@ai-fsm/domain";
import { observationFingerprints, recomputeVariantCache, type NewObservation } from "./ledger";

export interface BackfillReport {
  summaries: { candidates: number; inserted: number };
  receipts: { lines: number; matched: number; unmatched: number; inserted: number };
  variantsRecomputed: number;
}

async function insertAll(client: PoolClient, accountId: string, rows: NewObservation[]): Promise<number> {
  let inserted = 0;
  for (const row of rows) {
    const res = await client.query(
      `INSERT INTO price_observations
         (account_id, variant_id, kind, observed_on, unit_price_cents, store_family, source_ref,
          dedupe_key, note, status)
       VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8, $9, 'active')
       ON CONFLICT (account_id, dedupe_key) DO NOTHING`,
      [accountId, row.variantId, row.kind, row.observedOn, row.unitPriceCents, row.storeFamily, row.sourceRef, row.dedupeKey, row.note],
    );
    inserted += res.rowCount ?? 0;
  }
  return inserted;
}

export async function backfillPriceObservations(
  client: PoolClient,
  accountId: string,
  runId: string,
): Promise<BackfillReport> {
  const note = `backfill:${runId}`;

  // 1. Summaries from the cache as it stands now.
  const catalog = await client.query<{
    id: string;
    unit_cost_cents: number;
    store_family: StoreFamily;
    observed_on: string;
  }>(
    `SELECT id, unit_cost_cents, store_family,
            COALESCE(last_purchased_at, created_at::date)::text AS observed_on
     FROM materials_price_book
     WHERE account_id = $1 AND is_active = true AND unit_cost_cents > 0
     ORDER BY id`,
    [accountId],
  );
  const summaryRows: NewObservation[] = catalog.rows.map((r) => ({
    variantId: r.id,
    kind: "catalog_summary",
    observedOn: r.observed_on,
    unitPriceCents: r.unit_cost_cents,
    storeFamily: r.store_family,
    sourceRef: `summary:${r.id}`,
    dedupeKey: `summary:${r.id}`,
    note,
  }));
  const summariesInserted = await insertAll(client, accountId, summaryRows);

  // 2. Receipt lines, matched to existing variants only (nothing is created here).
  const lines = await client.query<{
    expense_id: string;
    vendor_name: string | null;
    expense_date: string | null;
    name: string;
    sku: string | null;
    unit_cost_cents: number;
    quantity: string | number;
  }>(
    `SELECT e.id AS expense_id, e.vendor_name, e.expense_date::text AS expense_date,
            li.name, li.sku, li.unit_cost_cents, li.quantity
     FROM expenses e
     JOIN expense_line_items li ON li.expense_id = e.id
     WHERE e.account_id = $1 AND e.category = 'materials'
       AND li.unit_cost_cents > 0 AND btrim(li.name) <> ''
     ORDER BY e.id, li.sort_order, li.created_at, li.id`,
    [accountId],
  );

  const byExpense = new Map<string, typeof lines.rows>();
  for (const line of lines.rows) {
    const list = byExpense.get(line.expense_id) ?? [];
    list.push(line);
    byExpense.set(line.expense_id, list);
  }

  let matched = 0;
  let unmatched = 0;
  const receiptRows: NewObservation[] = [];
  for (const [expenseId, list] of byExpense) {
    const keys = observationFingerprints(
      list.map((l) => ({ sku: l.sku, name: l.name, unitPriceCents: l.unit_cost_cents, quantity: Number(l.quantity) || 1 })),
    );
    for (const [i, line] of list.entries()) {
      const family = storeFamilyOf(line.vendor_name);
      const sku = line.sku?.trim() || null;
      const found = await client.query<{ id: string }>(
        sku
          ? `SELECT id FROM materials_price_book
             WHERE account_id = $1 AND is_active = true AND store_family = $2
               AND sku IS NOT NULL AND lower(btrim(sku)) = lower(btrim($3))
             LIMIT 1`
          : `SELECT id FROM materials_price_book
             WHERE account_id = $1 AND is_active = true AND store_family = $2
               AND lower(btrim(name)) = lower(btrim($3))
             ORDER BY (unit = 'each') DESC
             LIMIT 1`,
        [accountId, family, sku ?? line.name],
      );
      const variantId = found.rows[0]?.id;
      if (!variantId) {
        unmatched += 1;
        continue;
      }
      matched += 1;
      receiptRows.push({
        variantId,
        kind: "receipt",
        observedOn: line.expense_date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
        unitPriceCents: line.unit_cost_cents,
        storeFamily: family,
        sourceRef: `expense:${expenseId}`,
        dedupeKey: `receipt:${expenseId}:${keys[i]}`,
        note,
      });
    }
  }
  const receiptsInserted = await insertAll(client, accountId, receiptRows);

  // 3. Recompute every variant that has observations.
  const variants = await client.query<{ variant_id: string }>(
    `SELECT DISTINCT variant_id FROM price_observations WHERE account_id = $1 ORDER BY variant_id`,
    [accountId],
  );
  for (const v of variants.rows) {
    await recomputeVariantCache(client, accountId, v.variant_id);
  }

  return {
    summaries: { candidates: summaryRows.length, inserted: summariesInserted },
    receipts: { lines: lines.rows.length, matched, unmatched, inserted: receiptsInserted },
    variantsRecomputed: variants.rows.length,
  };
}
