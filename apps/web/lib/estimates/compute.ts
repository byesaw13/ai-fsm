/**
 * Orchestration layer: calls the pure estimate engine, then persists
 * the result to the database and syncs backward-compat line items.
 *
 * Never import this from the domain package — it has DB access.
 */

import { computeEstimate, CURRENT_RULES, ENGINE_VERSION, type PricingRules } from "@ai-fsm/domain";
import type { EstimateSpec, EstimateResult } from "@ai-fsm/domain";
import { getPool, query } from "@/lib/db";
import { calculateDepositPolicy } from "@/lib/estimates/deposit-policy";
import { missingSurchargeLines } from "@/lib/estimates/itemized-preserve";
import { loadPricingRules } from "@/lib/pricing/settings";
import { laborCostCentsFromHours } from "@/lib/pricing/labor-hours";

export interface ComputeAndPersistArgs {
  estimateId: string;
  accountId: string;
  spec: EstimateSpec;
  /** When omitted, loads account pricing settings from DB. */
  rules?: PricingRules;
  /**
   * The itemized rows already have their type and cost. Store the engine
   * snapshot, and do not replace those rows or the cost split.
   */
  preserveItemizedLines?: boolean;
  /**
   * Painting replaces its lines from the engine, which has no hour columns.
   * Write this range onto labor lines that are still blank.
   */
  stampLaborHours?: number | null;
}

export interface ComputeAndPersistResult {
  result: EstimateResult;
}

/**
 * Run the engine and write the result back to the estimates row.
 * Also syncs computed line items to estimate_line_items for backward compat.
 */
export async function computeAndPersist(args: ComputeAndPersistArgs): Promise<ComputeAndPersistResult> {
  const { estimateId, accountId, spec } = args;

  let rules = args.rules;
  if (!rules) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      // Transaction-local set_config requires an open transaction
      await client.query("BEGIN");
      await client.query(
        `SELECT set_config('app.current_account_id', $1, true)`,
        [accountId]
      );
      // Role needed for owner/admin insert seed path under RLS
      await client.query(
        `SELECT set_config('app.current_role', 'owner', true)`
      );
      rules = (await loadPricingRules(client, accountId)).rules;
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  const result = computeEstimate(spec, rules);

  if (args.preserveItemizedLines) {
    await query(
      `UPDATE estimates SET
         engine_spec       = $1,
         engine_version    = $2,
         rules_version     = $3,
         computed_result   = $4,
         last_computed_at  = NOW(),
         updated_at        = NOW()
       WHERE id = $5 AND account_id = $6`,
      [
        JSON.stringify(spec),
        ENGINE_VERSION,
        rules.version,
        JSON.stringify(result),
        estimateId,
        accountId,
      ]
    );
    await appendStoredSurchargeLines(estimateId);
    return { result };
  }

  const policyRows = await query<{
    deposit_required: boolean;
    deposit_type: "none" | "materials" | "percentage" | "fixed";
    deposit_percentage: number | null;
    deposit_fixed_cents: number | null;
  }>(
    `SELECT deposit_required, deposit_type, deposit_percentage, deposit_fixed_cents
     FROM estimates WHERE id = $1 AND account_id = $2`,
    [estimateId, accountId]
  );
  const policy = policyRows[0];
  const materialTotalCents = result.summary.materialCents + result.summary.handlingCents;
  const depositPolicy = calculateDepositPolicy({
    deposit_required: policy?.deposit_required ?? false,
    deposit_type: policy?.deposit_type ?? "none",
    deposit_percentage: policy?.deposit_percentage ?? null,
    deposit_fixed_cents: policy?.deposit_fixed_cents ?? null,
    material_total_cents: materialTotalCents,
    total_cents: result.summary.totalCents,
  });

  await query(
    `UPDATE estimates SET
       engine_spec       = $1,
       engine_version    = $2,
       rules_version     = $3,
       computed_result   = $4,
       last_computed_at  = NOW(),
       subtotal_cents    = $5,
       total_cents       = $6,
       deposit_cents     = $7,
       balance_cents     = $8,
       internal_labor_cost_cents   = $9,
       target_margin_pct           = $10,
       updated_at        = NOW()
     WHERE id = $11 AND account_id = $12`,
    [
      JSON.stringify(spec),
      ENGINE_VERSION,
      rules.version,
      JSON.stringify(result),
      result.summary.subtotalCents,
      result.summary.totalCents,
      depositPolicy.deposit_cents,
      depositPolicy.balance_cents,
      laborCostCentsFromHours(
        result.internalSummary.effectiveLaborHours,
        rules.laborCostCentsPerHour,
      ),
      Math.round(result.internalSummary.grossMarginPct * 100 * 10) / 10,
      estimateId,
      accountId,
    ]
  );

  await syncLineItems(estimateId, result);

  if (args.stampLaborHours != null && Number.isFinite(args.stampLaborHours) && args.stampLaborHours >= 0) {
    await query(
      `UPDATE estimate_line_items
       SET hours_low = $2, hours_high = $2, hours_source = 'owner'
       WHERE estimate_id = $1 AND option_id IS NULL AND line_item_type = 'labor'
         AND hours_low IS NULL AND hours_high IS NULL`,
      [estimateId, args.stampLaborHours],
    );
  }

  return { result };
}

/** Travel and risk are already in the total. Put them on the line list without touching typed rows. */
async function appendStoredSurchargeLines(estimateId: string): Promise<void> {
  const [estimate] = await query<{ travel_surcharge_cents: number; risk_adjustment_cents: number }>(
    `SELECT travel_surcharge_cents, risk_adjustment_cents FROM estimates WHERE id = $1`,
    [estimateId]
  );
  if (!estimate) return;
  const existing = await query<{ description: string }>(
    `SELECT description FROM estimate_line_items WHERE estimate_id = $1`,
    [estimateId]
  );
  const missing = missingSurchargeLines(
    existing.map((row) => row.description),
    estimate.travel_surcharge_cents,
    estimate.risk_adjustment_cents,
  );
  if (missing.length === 0) return;
  const [maxRow] = await query<{ max_sort: number }>(
    `SELECT COALESCE(MAX(sort_order), -1)::int AS max_sort FROM estimate_line_items WHERE estimate_id = $1`,
    [estimateId]
  );
  let sort = (maxRow?.max_sort ?? -1) + 1;
  for (const line of missing) {
    await query(
      `INSERT INTO estimate_line_items
         (estimate_id, description, quantity, unit_price_cents, total_cents,
          line_item_type, visible_to_customer, sort_order, unit_cost_cents)
       VALUES ($1, $2, 1, $3, $3, 'adjustment', true, $4, NULL)`,
      [estimateId, line.description, line.amountCents, sort]
    );
    sort += 1;
  }
}

async function syncLineItems(estimateId: string, result: EstimateResult): Promise<void> {
  // Remove engine-managed lines (option_id IS NULL = non-multi-option lines)
  await query(
    `DELETE FROM estimate_line_items WHERE estimate_id = $1 AND option_id IS NULL`,
    [estimateId]
  );

  if (result.lineItems.length === 0) return;

  const rows: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  for (let i = 0; i < result.lineItems.length; i++) {
    const line = result.lineItems[i];
    const dbType = toDbLineItemType(line.category);
    rows.push(`($${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++})`);
    values.push(
      estimateId,
      line.description,
      line.quantity,
      line.unitAmountCents,
      line.totalCents,
      dbType,
      line.visibleToCustomer,
      i,
      line.priceBookId ?? null,
    );
  }

  await query(
    `INSERT INTO estimate_line_items
       (estimate_id, description, quantity, unit_price_cents, total_cents,
        line_item_type, visible_to_customer, sort_order, price_book_id)
     VALUES ${rows.join(",")}`,
    values
  );
}

function toDbLineItemType(
  category: EstimateResult["lineItems"][0]["category"]
): string {
  switch (category) {
    case "labor":      return "labor";
    case "material":   return "materials";
    case "handling":   return "handling_fee";
    case "adjustment": return "adjustment";
  }
}
