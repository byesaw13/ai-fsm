"use client";

import { useMemo } from "react";
import {
  DEFAULT_PRICING_SETTINGS,
  buildPricingRules,
  groupMaterialsBySection,
  type BusinessPricingSettings,
} from "@ai-fsm/domain";
import type { MaterialsBySection } from "@ai-fsm/domain";
import { reviewEstimateGuardrails } from "@/lib/estimates/guardrails";
import type { EstimateGuardrailReview } from "@/lib/estimates/guardrails";
import type { PaintingEstimateResult } from "./useEstimatePricing";
import type { PriceBookEntry } from "./useEstimatePriceBook";
import type { ScopeBuilderResult } from "@/components/ScopeBuilder";
import { parseCents } from "@/lib/estimates/form-helpers";
import type { LineItemRow } from "@/lib/estimates/form-helpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EstimateLiveIntel {
  // Pricing
  totalCents: number;
  depositCents: number;
  balanceDueCents: number;

  // Materials
  materialsTotalCents: number;
  materialsBySection: MaterialsBySection[];
  hasAnyMaterials: boolean;

  // Margin & profit
  estimatedLaborCostCents: number;
  estimatedProfitCents: number;
  grossMarginPct: number;            // 0–100
  marginStatus: "green" | "yellow" | "red";
  isMarginReliable: boolean;         // false when no labor hours estimated

  // Revenue efficiency
  revenuePerLaborHourCents: number;  // cents per hour (0 when unreliable)

  // Confidence (0–100)
  confidenceScore: number;
  confidenceReasons: string[];       // what's reducing the score

  // Guardrails (live, not just at submit)
  guardrailReview: EstimateGuardrailReview;
}

interface UseEstimateLiveIntelInput {
  serviceType: "painting" | "generic";
  mode: "itemized" | "flat_rate" | "multi_option";
  paintingResult: PaintingEstimateResult | null;
  genericTotalCents: number;
  depositCents: number;
  balanceDueCents: number;
  scopeMaterialsTotalCents: number;
  scopeResults: Record<string, ScopeBuilderResult>;
  priceBookItems: PriceBookEntry[];
  lineItems: LineItemRow[];
  laborHours: string;                // string from form input; override for generic mode
  // Guardrail flags
  tripCount: "one_trip" | "multi_trip";
  requiresDryingOrCuring: boolean;
  difficultAccess: boolean;
  oldHouseRisk: boolean;
  coordinationRequired: boolean;
  finishExpectation: "basic" | "clean" | "premium";
  travelSurcharge: string;
  riskAdjustment: string;
  minimumOverrideReason: string;
  /** Account labor cost / margin floor (from Settings → Labor & Pricing). */
  pricingSettings?: BusinessPricingSettings;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useEstimateLiveIntel(input: UseEstimateLiveIntelInput): EstimateLiveIntel {
  return useMemo(() => {
    const {
      serviceType, mode,
      paintingResult, genericTotalCents, depositCents, balanceDueCents,
      scopeMaterialsTotalCents, scopeResults, priceBookItems, lineItems, laborHours,
      tripCount, requiresDryingOrCuring, difficultAccess, oldHouseRisk,
      coordinationRequired, finishExpectation, travelSurcharge, riskAdjustment,
      minimumOverrideReason,
      pricingSettings = DEFAULT_PRICING_SETTINGS,
    } = input;
    const laborCostCents = pricingSettings.labor_cost_cents_per_hour;
    const marginFloorPct = Math.round(pricingSettings.margin_floor_pct * 100);
    const pricingRules = buildPricingRules(pricingSettings);

    // ── Totals ────────────────────────────────────────────────────────────────
    let totalCents: number;
    let deposit: number;
    let balance: number;

    if (serviceType === "painting" && paintingResult) {
      totalCents = paintingResult.total_cents;
      deposit = depositCents;
      balance = balanceDueCents;
    } else {
      totalCents = genericTotalCents;
      deposit = depositCents;
      balance = balanceDueCents;
    }

    // ── Materials ─────────────────────────────────────────────────────────────
    // Aggregate ComputedMaterial[] from all ScopeBuilderResult instances
    const allMaterials = Object.values(scopeResults).flatMap((sr) => sr.materials ?? []);
    const materialsBySection = groupMaterialsBySection(allMaterials);
    const hasAnyMaterials = allMaterials.length > 0;
    const materialsTotalCents = scopeMaterialsTotalCents;

    // ── Labor cost estimate ───────────────────────────────────────────────────
    let estimatedLaborHours = 0;
    let isMarginReliable = false;
    let laborHoursOverridden = false;

    if (serviceType === "painting" && paintingResult) {
      // Painting: internal_labor_cost_cents already computed by engine
      const internalCost = paintingResult.internal_labor_cost_cents;
      const profitCents = totalCents - materialsTotalCents - internalCost;
      const marginPct = totalCents > 0 ? Math.max(0, Math.round((profitCents / totalCents) * 100)) : 0;
      const marginStatus: EstimateLiveIntel["marginStatus"] = marginPct >= 30 ? "green" : marginPct >= 15 ? "yellow" : "red";

      // Confidence score for painting
      const { score, reasons } = computeConfidence({
        hasAnyMaterials,
        laborHoursOverridden: false,
        guardrailWarnings: 0,    // computed below
        guardrailBlockers: 0,
        priceBookItemsWithoutScope: 0,
        totalCents,
      });

      const guardrailReview = reviewEstimateGuardrails({
        total_cents: totalCents,
        trip_count: tripCount,
        requires_drying_or_curing: requiresDryingOrCuring,
        difficult_access: difficultAccess,
        old_house_risk: oldHouseRisk,
        coordination_required: coordinationRequired,
        finish_expectation: finishExpectation,
        travel_surcharge_cents: parseCents(travelSurcharge),
        risk_adjustment_cents: parseCents(riskAdjustment),
        minimum_service_override_reason: (minimumOverrideReason as Parameters<typeof reviewEstimateGuardrails>[0]["minimum_service_override_reason"]) || null,
        margin_pct: marginPct / 100,
        has_ma_regulated_items: false,
        line_item_count: lineItems.filter((r) => r.description.trim()).length,
      }, pricingRules);

      const { score: finalScore, reasons: finalReasons } = computeConfidence({
        hasAnyMaterials,
        laborHoursOverridden: false,
        guardrailWarnings: guardrailReview.warnings.filter((w) => w.field !== "pricing" || !w.message.includes("Guardrails passed")).length,
        guardrailBlockers: guardrailReview.blockers.length,
        priceBookItemsWithoutScope: 0,
        totalCents,
      });

      const revenuePerHr = paintingResult.internal_labor_cost_cents > 0 && laborCostCents > 0
        ? Math.round(totalCents / (paintingResult.internal_labor_cost_cents / laborCostCents))
        : 0;

      return {
        totalCents,
        depositCents: deposit,
        balanceDueCents: balance,
        materialsTotalCents,
        materialsBySection,
        hasAnyMaterials,
        estimatedLaborCostCents: internalCost,
        estimatedProfitCents: profitCents,
        grossMarginPct: marginPct,
        marginStatus,
        isMarginReliable: true,
        revenuePerLaborHourCents: revenuePerHr,
        confidenceScore: finalScore,
        confidenceReasons: finalReasons,
        guardrailReview,
      };
    }

    // Generic mode: estimate labor from price book default_labor_hours or manual entry
    const manualHours = parseFloat(laborHours);
    if (!isNaN(manualHours) && manualHours > 0) {
      estimatedLaborHours = manualHours;
      laborHoursOverridden = true;
    } else {
      // Sum default_labor_hours from price book items
      estimatedLaborHours = priceBookItems.reduce(
        (sum, item) => sum + (item.service.default_labor_hours ?? 0), 0
      );
    }
    isMarginReliable = estimatedLaborHours > 0;

    const estimatedLaborCostCents = Math.round(estimatedLaborHours * laborCostCents);
    const estimatedProfitCents = totalCents - materialsTotalCents - estimatedLaborCostCents;
    const grossMarginPct = isMarginReliable && totalCents > 0
      ? Math.max(0, Math.round((estimatedProfitCents / totalCents) * 100))
      : 0;
    const marginStatus: EstimateLiveIntel["marginStatus"] =
      grossMarginPct >= marginFloorPct
        ? "green"
        : grossMarginPct >= Math.round(marginFloorPct / 2)
          ? "yellow"
          : "red";
    const revenuePerLaborHourCents = isMarginReliable && estimatedLaborHours > 0
      ? Math.round(totalCents / estimatedLaborHours)
      : 0;

    // Items without scope (price book items that have no ScopeBuilderResult yet)
    const priceBookItemsWithoutScope = priceBookItems.filter(
      (item) => !scopeResults[item.instanceId]
    ).length;

    const nonEmptyLineItems = lineItems.filter((r) => r.description.trim()).length;
    const lineItemCount = priceBookItems.length + nonEmptyLineItems;

    const guardrailReview = reviewEstimateGuardrails({
      total_cents: totalCents,
      trip_count: tripCount,
      requires_drying_or_curing: requiresDryingOrCuring,
      difficult_access: difficultAccess,
      old_house_risk: oldHouseRisk,
      coordination_required: coordinationRequired,
      finish_expectation: finishExpectation,
      travel_surcharge_cents: parseCents(travelSurcharge),
      risk_adjustment_cents: parseCents(riskAdjustment),
      minimum_service_override_reason: (minimumOverrideReason as Parameters<typeof reviewEstimateGuardrails>[0]["minimum_service_override_reason"]) || null,
      margin_pct: isMarginReliable ? grossMarginPct / 100 : null,
      has_ma_regulated_items: false,
      line_item_count: lineItemCount,
    }, pricingRules);

    const realWarnings = guardrailReview.warnings.filter(
      (w) => !(w.field === "pricing" && w.message.includes("Guardrails passed"))
    );
    const { score: confidenceScore, reasons: confidenceReasons } = computeConfidence({
      hasAnyMaterials,
      laborHoursOverridden,
      guardrailWarnings: realWarnings.length,
      guardrailBlockers: guardrailReview.blockers.length,
      priceBookItemsWithoutScope,
      totalCents,
    });

    return {
      totalCents,
      depositCents: deposit,
      balanceDueCents: balance,
      materialsTotalCents,
      materialsBySection,
      hasAnyMaterials,
      estimatedLaborCostCents,
      estimatedProfitCents,
      grossMarginPct,
      marginStatus,
      isMarginReliable,
      revenuePerLaborHourCents,
      confidenceScore,
      confidenceReasons,
      guardrailReview,
    };
  }, [
    input.serviceType, input.mode,
    input.paintingResult, input.genericTotalCents, input.depositCents, input.balanceDueCents,
    input.scopeMaterialsTotalCents, input.scopeResults, input.priceBookItems, input.lineItems,
    input.laborHours, input.tripCount, input.requiresDryingOrCuring, input.difficultAccess,
    input.oldHouseRisk, input.coordinationRequired, input.finishExpectation,
    input.travelSurcharge, input.riskAdjustment, input.minimumOverrideReason,
    input.pricingSettings,
  ]);
}

// ---------------------------------------------------------------------------
// Confidence score computation
// ---------------------------------------------------------------------------

function computeConfidence(params: {
  hasAnyMaterials: boolean;
  laborHoursOverridden: boolean;
  guardrailWarnings: number;
  guardrailBlockers: number;
  priceBookItemsWithoutScope: number;
  totalCents: number;
}): { score: number; reasons: string[] } {
  const { hasAnyMaterials, laborHoursOverridden, guardrailWarnings, guardrailBlockers, priceBookItemsWithoutScope, totalCents } = params;
  let score = 100;
  const reasons: string[] = [];

  if (totalCents === 0) {
    return { score: 0, reasons: ["No pricing entered yet"] };
  }

  if (!hasAnyMaterials && priceBookItemsWithoutScope === 0 && score > 0) {
    // No scope entered at all — penalize heavily
    score -= 20;
    reasons.push("No measurements entered — materials and margin unknown");
  } else if (priceBookItemsWithoutScope > 0) {
    score -= Math.min(20, priceBookItemsWithoutScope * 5);
    reasons.push(`${priceBookItemsWithoutScope} service${priceBookItemsWithoutScope > 1 ? "s" : ""} missing scope measurements`);
  }

  if (laborHoursOverridden) {
    score -= 10;
    reasons.push("Labor hours manually overridden");
  }

  const warningPenalty = Math.min(20, guardrailWarnings * 5);
  if (warningPenalty > 0) {
    score -= warningPenalty;
    reasons.push(`${guardrailWarnings} pricing warning${guardrailWarnings > 1 ? "s" : ""}`);
  }

  const blockerPenalty = Math.min(30, guardrailBlockers * 30);
  if (blockerPenalty > 0) {
    score -= blockerPenalty;
    reasons.push(`${guardrailBlockers} pricing blocker${guardrailBlockers > 1 ? "s" : ""}`);
  }

  return { score: Math.max(0, score), reasons };
}
