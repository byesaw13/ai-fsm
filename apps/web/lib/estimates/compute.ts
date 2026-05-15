/**
 * Orchestration layer: calls the pure estimate engine, then persists
 * the result to the database and syncs backward-compat line items.
 *
 * Never import this from the domain package — it has DB access.
 */

import { computeEstimate, CURRENT_RULES, ENGINE_VERSION } from "@ai-fsm/domain";
import type { EstimateSpec, EstimateResult } from "@ai-fsm/domain";
import { query } from "@/lib/db";

export interface ComputeAndPersistArgs {
  estimateId: string;
  accountId: string;
  spec: EstimateSpec;
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

  const result = computeEstimate(spec, CURRENT_RULES);

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
      CURRENT_RULES.version,
      JSON.stringify(result),
      result.summary.subtotalCents,
      result.summary.totalCents,
      result.summary.depositCents,
      result.summary.balanceDueCents,
      result.internalSummary.estimatedCostCents,
      Math.round(result.internalSummary.grossMarginPct * 100 * 10) / 10,
      estimateId,
      accountId,
    ]
  );

  await syncLineItems(estimateId, result);

  return { result };
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
