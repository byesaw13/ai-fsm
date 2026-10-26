/**
 * Internal cost of an itemized quote (TASK-190).
 *
 * Labor cost is labor lines only: hours × the cost rate when the line has
 * hours, otherwise customer price ÷ billing rate × cost rate. Materials and
 * equipment cost is the cost entered on the line, never the customer price.
 * Handling, adjustments and travel are neither. Margin is a fraction of the
 * customer prices on these lines. Nothing here adds a handling charge that
 * is not already a line.
 */

export interface CostSplitLine {
  line_item_type: string;
  quantity: number;
  unit_price_cents: number;
  unit_cost_cents?: number | null;
  /** Present once person-hours are stored (TASK-191). Used when the caller has them. */
  hours_high?: number | null;
  adjustment_type?: string | null;
}

export interface CostRates {
  billingCents: number;
  costCents: number;
}

export interface CostSplit {
  laborCostCents: number;
  materialCostCents: number;
  /** (customer price − labor cost − materials cost) / customer price. 0 when nothing is priced. */
  marginPct: number;
}

function linePriceCents(line: { quantity: number; unit_price_cents: number }): number {
  return Math.round(line.quantity * line.unit_price_cents);
}

function isMaterialCost(type: string): boolean {
  return type === "materials" || type === "equipment";
}

function isExcluded(line: CostSplitLine): boolean {
  return line.line_item_type === "handling_fee"
    || line.line_item_type === "adjustment"
    || line.adjustment_type === "travel_surcharge";
}

export function splitInternalCosts(lines: CostSplitLine[], rates: CostRates): CostSplit {
  let laborCostCents = 0;
  let materialCostCents = 0;
  let revenue = 0;

  for (const line of lines) {
    revenue += linePriceCents(line);
    if (isExcluded(line)) continue;
    if (isMaterialCost(line.line_item_type)) {
      if (line.unit_cost_cents != null && line.unit_cost_cents >= 0) {
        materialCostCents += Math.round(line.quantity * line.unit_cost_cents);
      }
      continue;
    }
    if (line.line_item_type !== "labor") continue;
    if (line.hours_high != null && Number.isFinite(line.hours_high)) {
      laborCostCents += Math.round(line.hours_high * rates.costCents);
    } else if (rates.billingCents > 0) {
      const price = linePriceCents(line);
      laborCostCents += Math.round((price / rates.billingCents) * rates.costCents);
    }
  }

  const marginPct = revenue > 0 ? (revenue - laborCostCents - materialCostCents) / revenue : 0;
  return { laborCostCents, materialCostCents, marginPct };
}

/** Whole-number percent, or null when the line is not priced above its cost. */
export function materialMarkupPct(line: {
  unit_price_cents: number;
  unit_cost_cents?: number | null;
}): number | null {
  const cost = line.unit_cost_cents;
  if (cost == null || cost <= 0) return null;
  if (line.unit_price_cents <= cost) return null;
  return Math.round(((line.unit_price_cents - cost) / cost) * 100);
}

export function markupLabel(line: {
  unit_price_cents: number;
  unit_cost_cents?: number | null;
}): string | null {
  const pct = materialMarkupPct(line);
  return pct == null ? null : `marked up ${pct}%`;
}

export function linePriceMissing(item: {
  line_item_type?: string;
  unit_price_cents?: number | null;
  unit_cost_cents?: number | null;
}): boolean {
  const type = item.line_item_type ?? "labor";
  if (type === "materials" || type === "equipment") {
    return item.unit_price_cents == null && item.unit_cost_cents == null;
  }
  return item.unit_price_cents == null;
}

/** A materials or equipment line with only a cost sells at that cost. */
export function defaultMaterialPrice<T extends {
  line_item_type?: string;
  unit_price_cents?: number | null;
  unit_cost_cents?: number | null;
}>(item: T): T & { unit_price_cents: number } {
  const type = item.line_item_type ?? "labor";
  if ((type === "materials" || type === "equipment") && item.unit_price_cents == null && item.unit_cost_cents != null) {
    return { ...item, unit_price_cents: item.unit_cost_cents };
  }
  return { ...item, unit_price_cents: item.unit_price_cents ?? 0 };
}
