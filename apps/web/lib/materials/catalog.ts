/**
 * Materials catalog learning: purchases become price observations (TASK-210).
 * The catalog row's price, average and last-paid fields are a cache the ledger
 * recomputes (lib/materials/ledger.ts); nothing here writes them directly.
 * Spec: docs/working/estimating-assistant-phase3.md §1.
 */
import type { PoolClient } from "pg";
import {
  findOrCreateVariant,
  observationFingerprints,
  recordObservations,
  replaceSourceObservations,
  type NewObservation,
} from "./ledger";

export type CatalogLineInput = {
  name: string;
  unit_cost_cents: number;
  sku?: string | null;
  quantity?: number;
  unit?: string;
  /** A discounted purchase: kept as evidence, never the regular price. */
  is_sale?: boolean;
  /** Overrides the generated key (the CSV import keys rows across the whole file). */
  dedupe_key?: string;
};

export type CatalogLearnContext = {
  accountId: string;
  supplier?: string | null;
  purchasedAt?: string | null; // YYYY-MM-DD
  category?: string;
  /** Where the purchase was seen. A receipt replaces its own earlier observations. */
  source: { kind: "receipt"; expenseId: string } | { kind: "supplier_csv"; ref: string };
  enteredBy?: string | null;
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Learn catalog prices from purchased lines. Returns how many lines became
 * observations (invalid lines are skipped; repeats of an existing observation
 * count as learned but add nothing).
 */
export async function learnMaterialsFromLineItems(
  client: PoolClient,
  ctx: CatalogLearnContext,
  lines: CatalogLineInput[],
): Promise<{ learned: number }> {
  const valid = lines.filter((l) => l.name.trim() && Math.round(l.unit_cost_cents) > 0);
  if (valid.length === 0) {
    // A receipt with no priced lines left keeps no observations.
    if (ctx.source.kind === "receipt") {
      await replaceSourceObservations(client, ctx.accountId, `expense:${ctx.source.expenseId}`, []);
    }
    return { learned: 0 };
  }
  const observedOn = ctx.purchasedAt?.slice(0, 10) || today();
  const fingerprints = observationFingerprints(
    valid.map((l) => ({ sku: l.sku, name: l.name, unitPriceCents: l.unit_cost_cents, quantity: l.quantity ?? 1 })),
  );
  const sourceRef = ctx.source.kind === "receipt" ? `expense:${ctx.source.expenseId}` : ctx.source.ref;

  const rows: NewObservation[] = [];
  for (let i = 0; i < valid.length; i++) {
    const line = valid[i];
    const variant = await findOrCreateVariant(
      client,
      ctx.accountId,
      { name: line.name, sku: line.sku, supplier: ctx.supplier, unit: line.unit, category: ctx.category },
      ctx.enteredBy ?? null,
    );
    if (!variant) continue;
    rows.push({
      variantId: variant.id,
      kind: ctx.source.kind,
      observedOn,
      unitPriceCents: Math.round(line.unit_cost_cents),
      storeFamily: variant.storeFamily,
      isSale: line.is_sale ?? false,
      sourceRef,
      dedupeKey:
        line.dedupe_key ??
        (ctx.source.kind === "receipt"
          ? `receipt:${ctx.source.expenseId}:${fingerprints[i]}`
          : `csv:${variant.storeFamily}:${observedOn}:${fingerprints[i]}`),
      enteredBy: ctx.enteredBy ?? null,
    });
  }

  if (ctx.source.kind === "receipt") {
    await replaceSourceObservations(client, ctx.accountId, sourceRef, rows);
  } else {
    await recordObservations(client, ctx.accountId, rows);
  }
  return { learned: rows.length };
}
