/**
 * Rule-based estimate reviewer.
 *
 * Analyzes an estimate against Dovetails business rules and returns
 * actionable suggestions. Designed to be swapped for an LLM backend
 * later — just replace `reviewEstimate()` with an API call.
 */

import {
  PAINTING_RATE_STANDARD_CENTS,
  PREP_LEVEL_MULTIPLIERS,
  PAINTING_TRIM_ADD_CENTS,
} from "@ai-fsm/domain";

export interface EstimateReviewSuggestion {
  type: "warning" | "info" | "tip";
  field: string;
  message: string;
  suggestion: string;
}

export interface EstimateReviewResult {
  suggestions: EstimateReviewSuggestion[];
  score: number; // 0-100, higher = better
  summary: string;
}

interface EstimateInput {
  sq_ft: number | null;
  prep_level: number | null;
  includes_trim: boolean;
  includes_ceiling: boolean;
  subtotal_cents: number;
  total_cents: number;
  internal_labor_cost_cents: number | null;
  internal_material_cost_cents: number | null;
  job_type?: string | null;
  notes?: string | null;
  target_margin_pct?: number | null;
  line_item_count: number;
}

export function reviewEstimate(estimate: EstimateInput): EstimateReviewResult {
  const suggestions: EstimateReviewSuggestion[] = [];

  const is_painting = estimate.sq_ft !== null && estimate.prep_level !== null;

  if (!is_painting) {
    // Generic estimate — minimal checks
    if (estimate.line_item_count === 0 && estimate.subtotal_cents > 0) {
      suggestions.push({
        type: "info",
        field: "line_items",
        message: "Flat-rate estimate with no line item breakdown.",
        suggestion: "Consider adding line items so the client sees the scope of work.",
      });
    }

    if (estimate.internal_labor_cost_cents !== null && estimate.subtotal_cents > 0) {
      const marginPct = computeMargin(
        estimate.subtotal_cents,
        estimate.internal_labor_cost_cents,
        estimate.internal_material_cost_cents
      );
      const target = estimate.target_margin_pct ?? 30;
      if (marginPct < target) {
        suggestions.push({
          type: "warning",
          field: "margin",
          message: `Gross margin is ${marginPct}% (target: ${target}%).`,
          suggestion: "Consider increasing the price or reducing estimated labor hours.",
        });
      }
    }

    return buildResult(suggestions, "Generic estimate reviewed.");
  }

  // --- Painting-specific checks ---

  const sqFt = estimate.sq_ft!;
  const prepLevel = estimate.prep_level!;
  const effectiveRate = computeEffectiveRate(estimate);

  // 1. Trim check
  if (!estimate.includes_trim) {
    suggestions.push({
      type: "warning",
      field: "includes_trim",
      message: "Trim is not included.",
      suggestion: `Most painting jobs include trim. Adding trim would add ~$${((sqFt * PAINTING_TRIM_ADD_CENTS) / 100).toFixed(2)} (${sqFt.toLocaleString()} sq ft × $0.20).`,
    });
  }

  // 2. Prep level check
  if (prepLevel <= 3 && sqFt > 800) {
    suggestions.push({
      type: "warning",
      field: "prep_level",
      message: `Prep level ${prepLevel} may be too low for ${sqFt.toLocaleString()} sq ft.`,
      suggestion: "Larger areas often need more prep. Consider level 5+ for a safer margin.",
    });
  }

  if (prepLevel >= 8 && sqFt < 300) {
    suggestions.push({
      type: "info",
      field: "prep_level",
      message: `Prep level ${prepLevel} is high for a small area (${sqFt.toLocaleString()} sq ft).`,
      suggestion: "Make sure the high prep level is justified — small rooms rarely need extensive repair.",
    });
  }

  // 3. Ceiling check
  if (!estimate.includes_ceiling && sqFt > 500) {
    suggestions.push({
      type: "tip",
      field: "includes_ceiling",
      message: "Ceiling not included.",
      suggestion: "For rooms over 500 sq ft, ceilings add ~30% more surface area. Ask the client.",
    });
  }

  // 4. Effective rate check
  const minAcceptableRate = PAINTING_RATE_STANDARD_CENTS * 0.8;
  const maxReasonableRate = PAINTING_RATE_STANDARD_CENTS * 2.0;
  if (effectiveRate < minAcceptableRate) {
    suggestions.push({
      type: "warning",
      field: "pricing",
      message: `Effective rate of $${(effectiveRate / 100).toFixed(2)}/sq ft is below minimum.`,
      suggestion: `Standard rate is $${(PAINTING_RATE_STANDARD_CENTS / 100).toFixed(2)}/sq ft. Verify this is intentional.`,
    });
  }
  if (effectiveRate > maxReasonableRate) {
    suggestions.push({
      type: "info",
      field: "pricing",
      message: `Effective rate of $${(effectiveRate / 100).toFixed(2)}/sq ft is unusually high.`,
      suggestion: "Double-check the prep level and sq ft values — the rate may be inflated.",
    });
  }

  // 5. Margin check
  if (estimate.internal_labor_cost_cents !== null) {
    const marginPct = computeMargin(
      estimate.subtotal_cents,
      estimate.internal_labor_cost_cents,
      estimate.internal_material_cost_cents
    );
    const target = estimate.target_margin_pct ?? 30;
    if (marginPct < 15) {
      suggestions.push({
        type: "warning",
        field: "margin",
        message: `Gross margin is ${marginPct}% — critically low (target: ${target}%).`,
        suggestion: "This job will likely lose money. Increase price or reduce labor hours estimate.",
      });
    } else if (marginPct < target) {
      suggestions.push({
        type: "warning",
        field: "margin",
        message: `Gross margin is ${marginPct}% (target: ${target}%).`,
        suggestion: "Margin is below target. Consider adjusting pricing.",
      });
    } else if (marginPct > 60) {
      suggestions.push({
        type: "tip",
        field: "margin",
        message: `Gross margin is ${marginPct}% — very healthy.`,
        suggestion: "You have room to be competitive if needed.",
      });
    }
  }

  // 6. Line item check for painting
  if (estimate.line_item_count === 0 && estimate.subtotal_cents > 0) {
    suggestions.push({
      type: "info",
      field: "line_items",
      message: "No line items — estimate total won't show a breakdown to the client.",
      suggestion: "Use the painting estimator to auto-generate line items with scope details.",
    });
  }

  return buildResult(suggestions, "Painting estimate reviewed.");
}

function computeEffectiveRate(estimate: EstimateInput): number {
  const sqFt = estimate.sq_ft!;
  const prepLevel = estimate.prep_level!;
  const prepMultiplier = PREP_LEVEL_MULTIPLIERS[Math.max(1, Math.min(10, prepLevel))] ?? 1;
  const baseRate = PAINTING_RATE_STANDARD_CENTS;
  const effectiveRate = Math.round(baseRate * prepMultiplier);

  const effectiveSqFt = estimate.includes_ceiling ? sqFt * 1.3 : sqFt;
  const trimAdd = estimate.includes_trim ? Math.round(sqFt * PAINTING_TRIM_ADD_CENTS) : 0;
  const laborTotal = Math.round(effectiveSqFt * effectiveRate) + trimAdd;

  return Math.round(laborTotal / sqFt);
}

function computeMargin(
  subtotalCents: number,
  internalLaborCents: number,
  internalMaterialCents: number | null
): number {
  const materialCents = internalMaterialCents ?? 0;
  const materialHandling = Math.round(materialCents * 0.15);
  const laborRevenue = subtotalCents - materialCents - materialHandling;
  if (laborRevenue <= 0) return 0;
  const marginCents = laborRevenue - internalLaborCents;
  return Math.round((marginCents / laborRevenue) * 100 * 10) / 10;
}

function buildResult(
  suggestions: EstimateReviewSuggestion[],
  summary: string
): EstimateReviewResult {
  const warningCount = suggestions.filter((s) => s.type === "warning").length;
  const score = Math.max(0, 100 - warningCount * 20 - suggestions.filter((s) => s.type === "info").length * 5);

  return {
    suggestions,
    score,
    summary: warningCount === 0
      ? `${summary} No issues found.`
      : `${summary} ${warningCount} warning(s) need attention.`,
  };
}
