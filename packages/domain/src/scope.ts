import { z } from "zod";

export const scopeInputTypeSchema = z.enum(["number", "select", "boolean"]);
export type ScopeInputType = z.infer<typeof scopeInputTypeSchema>;

export const complexityFactorTypeSchema = z.enum(["multiplier", "adder"]);
export type ComplexityFactorType = z.infer<typeof complexityFactorTypeSchema>;

export const profitabilityRuleTypeSchema = z.enum([
  "min_sqft_rate_cents",
  "min_gross_margin_pct",
  "min_service_fee_cents",
  "min_hourly_rate_cents",
]);
export type ProfitabilityRuleType = z.infer<typeof profitabilityRuleTypeSchema>;

export interface ScopeComponentOption {
  value: string;
  label: string;
}

export interface ScopeComponent {
  id: string;
  key: string;
  label: string;
  unit: string | null;
  input_type: ScopeInputType;
  options: ScopeComponentOption[] | null;
  required: boolean;
  sort_order: number;
}

export interface ComplexityFactor {
  id: string;
  key: string;
  label: string;
  description: string | null;
  factor_type: ComplexityFactorType;
  default_value: number;
  sort_order: number;
}

export interface ProfitabilityRule {
  id: string;
  category: string;
  rule_type: ProfitabilityRuleType;
  value: number;
  description: string | null;
}

export interface ScopeTemplate {
  id: string;
  category: string;
  label: string;
  description: string | null;
  default_assumptions: string | null;
  components: ScopeComponent[];
  complexity_factors: ComplexityFactor[];
}

// Values captured during estimate assembly
export interface ScopeComponentValues {
  [key: string]: string | number | boolean | null;
}

export interface ComplexityValues {
  [key: string]: boolean;
}

// ============================================================
// Material rules
// ============================================================

export type MaterialQuantityType = "static" | "per_component" | "per_coverage";

export interface ServiceMaterial {
  id: string;
  price_book_id: string | null;
  category: string | null;
  material_name: string;
  description: string | null;
  quantity_type: MaterialQuantityType;
  scope_component_key: string | null;
  quantity_multiplier: number | null; // per_component: multiply; per_coverage: coverage rate (sqft/gal)
  quantity_flat: number | null;
  waste_factor: number;              // 1.10 = 10% waste
  unit: string;
  unit_cost_cents: number;
  store_section: string;
  is_consumable: boolean;
  is_optional: boolean;
  condition_factor_key: string | null; // only include when this complexity factor is checked
  sort_order: number;
}

export interface ComputedMaterial {
  material: ServiceMaterial;
  quantity: number;           // computed, rounded up, waste included
  total_cost_cents: number;
}

export interface MaterialsBySection {
  section: string;
  items: ComputedMaterial[];
  section_total_cents: number;
}

// Compute material quantities from scope component values and applied complexity factors
export function computeMaterials(
  materials: ServiceMaterial[],
  components: ScopeComponentValues,
  complexity: ComplexityValues
): ComputedMaterial[] {
  const result: ComputedMaterial[] = [];

  for (const mat of materials) {
    // Check conditional factor
    if (mat.condition_factor_key && !complexity[mat.condition_factor_key]) continue;

    let rawQty = 0;

    switch (mat.quantity_type) {
      case "static":
        rawQty = mat.quantity_flat ?? 1;
        break;

      case "per_component": {
        const scopeVal = mat.scope_component_key ? Number(components[mat.scope_component_key] ?? 0) : 0;
        if (scopeVal <= 0) continue; // skip if measurement not provided
        rawQty = scopeVal * (mat.quantity_multiplier ?? 1);
        break;
      }

      case "per_coverage": {
        const scopeVal = mat.scope_component_key ? Number(components[mat.scope_component_key] ?? 0) : 0;
        if (scopeVal <= 0) continue;
        const coverageRate = mat.quantity_multiplier ?? 1;
        rawQty = scopeVal / coverageRate;
        break;
      }
    }

    // Apply waste factor and round up to whole purchasable units
    const withWaste = rawQty * mat.waste_factor;
    const quantity = Math.max(1, Math.ceil(withWaste));

    result.push({
      material: mat,
      quantity,
      total_cost_cents: Math.round(quantity * mat.unit_cost_cents),
    });
  }

  return result;
}

// Group computed materials by store section
export function groupMaterialsBySection(computed: ComputedMaterial[]): MaterialsBySection[] {
  const sectionMap = new Map<string, ComputedMaterial[]>();

  for (const item of computed) {
    const section = item.material.store_section;
    if (!sectionMap.has(section)) sectionMap.set(section, []);
    sectionMap.get(section)!.push(item);
  }

  const SECTION_ORDER = [
    "Paint & Supplies",
    "Lumber & Trim",
    "Building Materials",
    "Hardware & Fasteners",
    "Plumbing",
    "Electrical",
    "Outdoor & Garden",
    "Flooring & Tile",
  ];

  const sections = Array.from(sectionMap.entries()).map(([section, items]) => ({
    section,
    items: items.sort((a, b) => a.material.sort_order - b.material.sort_order),
    section_total_cents: items.reduce((sum, i) => sum + i.total_cost_cents, 0),
  }));

  return sections.sort((a, b) => {
    const ai = SECTION_ORDER.indexOf(a.section);
    const bi = SECTION_ORDER.indexOf(b.section);
    if (ai === -1 && bi === -1) return a.section.localeCompare(b.section);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

// Weighted surplus reduction prevents runaway stacking when multiple complexity factors combine.
// 1st factor: full surplus; 2nd: 60%; 3rd+: 30%. Hard cap at 1.75× regardless.
const MODIFIER_SURPLUS_WEIGHTS = [1.0, 0.6, 0.3];
const MAX_SCOPE_MULTIPLIER = 1.75;

// Compute the combined complexity multiplier and flat adders from applied factors
export function computeScopeModifier(
  factors: ComplexityFactor[],
  applied: ComplexityValues
): { multiplier: number; adderCents: number } {
  let adderCents = 0;
  const surpluses: number[] = [];

  for (const factor of factors) {
    if (!applied[factor.key]) continue;
    if (factor.factor_type === "multiplier") {
      surpluses.push(factor.default_value - 1.0);
    } else {
      adderCents += factor.default_value;
    }
  }

  // Sort largest surplus first so highest-impact factor gets full weight
  surpluses.sort((a, b) => Math.abs(b) - Math.abs(a));

  let multiplier = 1.0;
  for (let i = 0; i < surpluses.length; i++) {
    const weight = MODIFIER_SURPLUS_WEIGHTS[Math.min(i, MODIFIER_SURPLUS_WEIGHTS.length - 1)];
    multiplier *= 1.0 + surpluses[i] * weight;
    if (multiplier >= MAX_SCOPE_MULTIPLIER) {
      multiplier = MAX_SCOPE_MULTIPLIER;
      break;
    }
  }

  return { multiplier, adderCents };
}

// Check a price against profitability rules — returns any violations
export function checkProfitabilityRules(
  rules: ProfitabilityRule[],
  category: string,
  params: {
    totalCents: number;
    sqft?: number;
    grossMarginPct?: number;
    effectiveHourlyRateCents?: number;
  }
): { rule: ProfitabilityRule; actual: number; required: number }[] {
  const applicable = rules.filter(
    (r) => r.category === category || r.category === "all"
  );
  const violations: { rule: ProfitabilityRule; actual: number; required: number }[] = [];

  for (const rule of applicable) {
    switch (rule.rule_type) {
      case "min_service_fee_cents":
        if (params.totalCents < rule.value) {
          violations.push({ rule, actual: params.totalCents, required: rule.value });
        }
        break;
      case "min_sqft_rate_cents":
        if (params.sqft && params.sqft > 0) {
          const rate = params.totalCents / params.sqft;
          if (rate < rule.value) {
            violations.push({ rule, actual: Math.round(rate), required: rule.value });
          }
        }
        break;
      case "min_gross_margin_pct":
        if (params.grossMarginPct !== undefined && params.grossMarginPct < rule.value) {
          violations.push({ rule, actual: Math.round(params.grossMarginPct), required: rule.value });
        }
        break;
      case "min_hourly_rate_cents":
        if (params.effectiveHourlyRateCents !== undefined && params.effectiveHourlyRateCents < rule.value) {
          violations.push({ rule, actual: params.effectiveHourlyRateCents, required: rule.value });
        }
        break;
    }
  }

  return violations;
}
