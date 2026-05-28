// ---------------------------------------------------------------------------
// Production rate anchors — labor throughput logic
// ---------------------------------------------------------------------------

export interface ProductionRate {
  id: string;
  service_code: string;
  scope_component_key: string;
  base_rate: number;   // units per day at baseline
  rate_unit: "sqft_per_day" | "sqft_per_hour" | "linear_ft_per_day" | "units_per_day";
  notes: string | null;
}

export interface ProductionRateModifier {
  id: string;
  service_code: string;
  complexity_factor_key: string;
  modifier_pct: number;  // e.g. -0.15 = 15% production penalty
  notes: string | null;
}

export interface LaborEstimate {
  base_rate: number;
  adjusted_rate: number;
  rate_unit: ProductionRate["rate_unit"];
  quantity: number;          // sqft or other unit value from scope
  labor_days: number;        // quantity / adjusted_rate (or /8 for per_hour)
  labor_days_min: number;    // labor_days × 0.85 (±15% range)
  labor_days_max: number;    // labor_days × 1.15
  applied_modifiers: Array<{ key: string; modifier_pct: number }>;
  modifier_total_pct: number;
}

/**
 * Compute implied labor from a production rate, scope quantity, and active
 * complexity factors. Returns null if the scope component key has no value.
 */
export function computeLaborDays(
  rate: ProductionRate,
  modifiers: ProductionRateModifier[],
  scopeValues: Record<string, string | number | boolean | null>,
  activeComplexityKeys: string[]
): LaborEstimate | null {
  const rawQty = scopeValues[rate.scope_component_key];
  const quantity = typeof rawQty === "number" ? rawQty : parseFloat(String(rawQty ?? ""));
  if (!quantity || isNaN(quantity) || quantity <= 0) return null;

  const applied = modifiers.filter((m) =>
    m.service_code === rate.service_code &&
    activeComplexityKeys.includes(m.complexity_factor_key)
  );

  const modifierTotalPct = applied.reduce((sum, m) => sum + m.modifier_pct, 0);
  const adjustedRate = rate.base_rate * (1 + modifierTotalPct);

  let laborDays: number;
  if (rate.rate_unit === "sqft_per_hour" || rate.rate_unit === "linear_ft_per_day") {
    // sqft_per_hour → divide by 8 to get days
    laborDays = rate.rate_unit === "sqft_per_hour"
      ? quantity / adjustedRate / 8
      : quantity / adjustedRate;
  } else {
    laborDays = quantity / adjustedRate;
  }

  return {
    base_rate: rate.base_rate,
    adjusted_rate: adjustedRate,
    rate_unit: rate.rate_unit,
    quantity,
    labor_days: Math.round(laborDays * 10) / 10,
    labor_days_min: Math.round(laborDays * 0.85 * 10) / 10,
    labor_days_max: Math.round(laborDays * 1.15 * 10) / 10,
    applied_modifiers: applied.map((m) => ({ key: m.complexity_factor_key, modifier_pct: m.modifier_pct })),
    modifier_total_pct: modifierTotalPct,
  };
}

/** Format a labor estimate as a human-readable string for display. */
export function formatLaborEstimate(est: LaborEstimate): string {
  const unit = est.rate_unit === "sqft_per_day" || est.rate_unit === "linear_ft_per_day"
    ? "day"
    : "day";  // sqft_per_hour is already converted to days
  const range = est.labor_days_min === est.labor_days_max
    ? `${est.labor_days}${unit}`
    : `${est.labor_days_min}–${est.labor_days_max} ${unit}s`;
  const modNote = est.modifier_total_pct !== 0
    ? ` (${est.modifier_total_pct > 0 ? "+" : ""}${Math.round(est.modifier_total_pct * 100)}% from modifiers)`
    : "";
  return `~${range}${modNote}`;
}
