/**
 * Internal P&L cost rollup for a project (owner view).
 *
 * Materials must not be double-counted:
 * - Linked receipt expenses (category=materials) are the preferred source.
 * - jobs.actual_cost_cents is a legacy/manual parts rollup only when no receipts exist.
 */

export type MaterialsCostSource = "receipts" | "parts_rollup" | "none";

export function materialsCostForInternalPnl(opts: {
  materialsReceiptCents: number;
  partsRollupCents: number;
}): { materialsCents: number; source: MaterialsCostSource } {
  const receipts = Math.max(0, opts.materialsReceiptCents || 0);
  const parts = Math.max(0, opts.partsRollupCents || 0);
  if (receipts > 0) return { materialsCents: receipts, source: "receipts" };
  if (parts > 0) return { materialsCents: parts, source: "parts_rollup" };
  return { materialsCents: 0, source: "none" };
}

export function internalPnlCostCents(opts: {
  laborCostCents: number | null;
  materialsReceiptCents: number;
  partsRollupCents: number;
  otherExpenseCents?: number;
}): number | null {
  const materials = materialsCostForInternalPnl(opts);
  const other = Math.max(0, opts.otherExpenseCents ?? 0);
  const labor = opts.laborCostCents;
  if (labor === null && materials.materialsCents === 0 && other === 0) return null;
  return (labor ?? 0) + materials.materialsCents + other;
}
