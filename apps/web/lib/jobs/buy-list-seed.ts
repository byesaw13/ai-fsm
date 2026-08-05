import type { PoolClient } from "pg";
import { computeMaterials, groupMaterialsBySection } from "@ai-fsm/domain";
import type { ComplexityValues, ScopeComponentValues, ServiceMaterial } from "@ai-fsm/domain";
import {
  mapRecomputedSectionsToLines,
  mapShoppingListJsonToLines,
  mergeMissingLines,
  type BuyListLineInput,
} from "./buy-list";

export interface SeedEstimatePick {
  id: string;
  status: string;
  shopping_list_json: unknown;
}

/** Prefer approved, else latest sent (then any with shopping list). */
export async function pickSeedEstimate(
  client: PoolClient,
  accountId: string,
  jobId: string,
): Promise<SeedEstimatePick | null> {
  const r = await client.query<SeedEstimatePick>(
    `SELECT id, status, shopping_list_json
     FROM estimates
     WHERE account_id = $1 AND job_id = $2
     ORDER BY
       CASE status
         WHEN 'approved' THEN 0
         WHEN 'sent' THEN 1
         ELSE 2
       END,
       updated_at DESC NULLS LAST,
       created_at DESC
     LIMIT 1`,
    [accountId, jobId],
  );
  return r.rows[0] ?? null;
}

async function recomputeShoppingLines(
  client: PoolClient,
  estimateId: string,
): Promise<BuyListLineInput[]> {
  const snapshots = await client.query<{
    category: string;
    components: ScopeComponentValues;
    complexity: ComplexityValues;
  }>(
    `SELECT category, components, complexity
     FROM estimate_scope_snapshots
     WHERE estimate_id = $1
     ORDER BY created_at ASC`,
    [estimateId],
  );
  if (snapshots.rows.length === 0) return [];

  const categories = [
    ...new Set(snapshots.rows.map((s) => s.category).filter(Boolean)),
  ];
  if (categories.length === 0) return [];

  const catPlaceholders = categories.map((_, i) => `$${i + 1}`).join(", ");
  const materialRows = await client.query<{
    id: string;
    price_book_id: string | null;
    category: string | null;
    material_name: string;
    description: string | null;
    quantity_type: ServiceMaterial["quantity_type"];
    scope_component_key: string | null;
    quantity_multiplier: number | null;
    quantity_flat: number | null;
    waste_factor: number;
    unit: string;
    unit_cost_cents: number;
    store_section: string;
    is_consumable: boolean;
    is_optional: boolean;
    condition_factor_key: string | null;
    sort_order: number;
  }>(
    `SELECT id, price_book_id, category, material_name, description,
            quantity_type, scope_component_key,
            quantity_multiplier::float, quantity_flat::float,
            waste_factor::float, unit, unit_cost_cents,
            store_section, is_consumable, is_optional,
            condition_factor_key, sort_order
     FROM service_materials
     WHERE category IN (${catPlaceholders})
     ORDER BY category, sort_order ASC`,
    categories,
  );

  const serviceMaterials: ServiceMaterial[] = materialRows.rows.map((m) => ({
    id: m.id,
    price_book_id: m.price_book_id,
    category: m.category,
    material_name: m.material_name,
    description: m.description,
    quantity_type: m.quantity_type,
    scope_component_key: m.scope_component_key,
    quantity_multiplier: m.quantity_multiplier,
    quantity_flat: m.quantity_flat,
    waste_factor: m.waste_factor,
    unit: m.unit,
    unit_cost_cents: m.unit_cost_cents,
    store_section: m.store_section,
    is_consumable: m.is_consumable,
    is_optional: m.is_optional,
    condition_factor_key: m.condition_factor_key,
    sort_order: m.sort_order,
  }));

  // Merge duplicate material.id across snapshots (same as shopping-list path).
  const byId = new Map<string, ReturnType<typeof computeMaterials>[number]>();
  for (const snap of snapshots.rows) {
    const mats = serviceMaterials.filter((m) => m.category === snap.category);
    for (const item of computeMaterials(mats, snap.components ?? {}, snap.complexity ?? {})) {
      const existing = byId.get(item.material.id);
      if (existing) {
        existing.quantity += item.quantity;
        existing.total_cost_cents = Math.round(
          existing.quantity * existing.material.unit_cost_cents,
        );
      } else {
        byId.set(item.material.id, { ...item });
      }
    }
  }
  const grouped = groupMaterialsBySection(Array.from(byId.values()));
  return mapRecomputedSectionsToLines(grouped);
}

/** Resolve seed line candidates from estimate (JSON first, else recompute). */
export async function buildSeedLinesFromEstimate(
  client: PoolClient,
  estimate: SeedEstimatePick,
): Promise<BuyListLineInput[]> {
  const fromJson = mapShoppingListJsonToLines(estimate.shopping_list_json);
  if (fromJson.length > 0) return fromJson;
  return recomputeShoppingLines(client, estimate.id);
}

export async function insertBuyListLines(
  client: PoolClient,
  accountId: string,
  jobId: string,
  lines: BuyListLineInput[],
): Promise<number> {
  let n = 0;
  for (const line of lines) {
    await client.query(
      `INSERT INTO job_material_lines
         (account_id, job_id, name, quantity, unit_label, store_section,
          status, source, catalog_material_id, sku, notes, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        accountId,
        jobId,
        line.name,
        line.quantity,
        line.unit_label,
        line.store_section,
        line.status,
        line.source,
        line.catalog_material_id,
        line.sku,
        line.notes,
        line.sort_order,
      ],
    );
    n++;
  }
  return n;
}

export type SeedResult =
  | { ok: true; mode: "seeded" | "already_seeded" | "reseed_added"; inserted: number; estimateId: string | null }
  | { ok: false; code: "NO_ESTIMATE" | "NO_LINES"; message: string };

/**
 * First seed (when materials_plan_seeded_at is null) or reseed (add-missing only).
 */
export async function seedJobBuyList(
  client: PoolClient,
  opts: {
    accountId: string;
    jobId: string;
    reseed?: boolean;
  },
): Promise<SeedResult> {
  const job = await client.query<{
    materials_plan_seeded_at: string | null;
  }>(
    `SELECT materials_plan_seeded_at FROM jobs WHERE id = $1 AND account_id = $2`,
    [opts.jobId, opts.accountId],
  );
  if (job.rows.length === 0) {
    return { ok: false, code: "NO_ESTIMATE", message: "Job not found" };
  }

  const alreadySeeded = job.rows[0].materials_plan_seeded_at != null;
  if (alreadySeeded && !opts.reseed) {
    return {
      ok: true,
      mode: "already_seeded",
      inserted: 0,
      estimateId: null,
    };
  }

  const estimate = await pickSeedEstimate(client, opts.accountId, opts.jobId);
  if (!estimate) {
    // Mark seeded so we don't thrash; empty plan is valid for T&M
    if (!alreadySeeded) {
      await client.query(
        `UPDATE jobs SET materials_plan_seeded_at = now(), materials_plan_seed_estimate_id = NULL
         WHERE id = $1 AND account_id = $2`,
        [opts.jobId, opts.accountId],
      );
    }
    return {
      ok: false,
      code: "NO_ESTIMATE",
      message: "No estimate linked to this job to seed from",
    };
  }

  const candidates = await buildSeedLinesFromEstimate(client, estimate);

  if (opts.reseed || alreadySeeded) {
    const existing = await client.query<{ name: string; unit_label: string | null }>(
      `SELECT name, unit_label FROM job_material_lines
       WHERE job_id = $1 AND account_id = $2`,
      [opts.jobId, opts.accountId],
    );
    const toAdd = mergeMissingLines(existing.rows, candidates);
    const inserted = await insertBuyListLines(client, opts.accountId, opts.jobId, toAdd);
    await client.query(
      `UPDATE jobs SET materials_plan_seeded_at = COALESCE(materials_plan_seeded_at, now()),
                          materials_plan_seed_estimate_id = $3
       WHERE id = $1 AND account_id = $2`,
      [opts.jobId, opts.accountId, estimate.id],
    );
    return {
      ok: true,
      mode: "reseed_added",
      inserted,
      estimateId: estimate.id,
    };
  }

  // First seed — even if empty (timestamp still set)
  const inserted = await insertBuyListLines(client, opts.accountId, opts.jobId, candidates);
  await client.query(
    `UPDATE jobs SET materials_plan_seeded_at = now(), materials_plan_seed_estimate_id = $3
     WHERE id = $1 AND account_id = $2`,
    [opts.jobId, opts.accountId, estimate.id],
  );

  if (candidates.length === 0) {
    return {
      ok: false,
      code: "NO_LINES",
      message: "Estimate has no materials list to seed; add lines manually",
    };
  }

  return {
    ok: true,
    mode: "seeded",
    inserted,
    estimateId: estimate.id,
  };
}
