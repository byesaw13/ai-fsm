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

// Compute the combined complexity multiplier and flat adders from applied factors
export function computeScopeModifier(
  factors: ComplexityFactor[],
  applied: ComplexityValues
): { multiplier: number; adderCents: number } {
  let multiplier = 1.0;
  let adderCents = 0;
  for (const factor of factors) {
    if (!applied[factor.key]) continue;
    if (factor.factor_type === "multiplier") {
      multiplier *= factor.default_value;
    } else {
      adderCents += factor.default_value;
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
