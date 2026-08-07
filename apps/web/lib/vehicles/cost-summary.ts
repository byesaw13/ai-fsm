/**
 * Pure helpers over vehicle_cost_summary rows (TASK-093).
 */

export type VehicleCostSummaryRow = {
  account_id: string;
  vehicle_id: string;
  period_month: string; // YYYY-MM-DD (first of month)
  category: string;
  total_cents: number;
  expense_count: number;
};

export type AggregatedVehicleCost = {
  totalCents: number;
  byCategory: Record<string, number>;
  expenseCount: number;
  /** totalCents / miles when miles > 0; else null */
  costPerMileCents: number | null;
};

/** Collapse cost-summary rows into totals + optional cost-per-mile. */
export function aggregateVehicleCost(
  rows: Pick<VehicleCostSummaryRow, "category" | "total_cents" | "expense_count">[],
  milesInPeriod: number | null,
): AggregatedVehicleCost {
  const byCategory: Record<string, number> = {};
  let totalCents = 0;
  let expenseCount = 0;
  for (const r of rows) {
    const cents = Number(r.total_cents) || 0;
    const count = Number(r.expense_count) || 0;
    byCategory[r.category] = (byCategory[r.category] ?? 0) + cents;
    totalCents += cents;
    expenseCount += count;
  }
  const miles = milesInPeriod != null && milesInPeriod > 0 ? milesInPeriod : null;
  return {
    totalCents,
    byCategory,
    expenseCount,
    costPerMileCents: miles != null ? Math.round(totalCents / miles) : null,
  };
}
