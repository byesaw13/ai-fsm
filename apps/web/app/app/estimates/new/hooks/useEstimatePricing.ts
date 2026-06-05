"use client";

import { useMemo } from "react";
import { computeEstimate, CURRENT_RULES, ENGINE_VERSION, type EstimateSpec } from "@ai-fsm/domain";
import { formatCents } from "@/lib/estimates/pricing";
import { calculateDepositPolicy } from "@/lib/estimates/deposit-policy";
import type { DepositDueTrigger, DepositType } from "@/lib/estimates/deposit-policy";
import { parseCents, lineTotal, mapPrepLevel, type LineItemRow, type OptionTier } from "@/lib/estimates/form-helpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PaintingEstimateResult {
  labor_flat_rate_cents: number;
  material_cents: number;
  material_handling_cents: number;
  total_cents: number;
  deposit_cents: number;
  balance_cents: number;
  internal_labor_cost_cents: number;
  gross_margin_pct: number;
  gross_margin_cents: number;
  effective_sq_ft_rate_cents: number;
  _spec: EstimateSpec;
}

export interface PricingResult {
  paintingResult: PaintingEstimateResult | null;
  taxRateNum: number;
  materialLineItems: LineItemRow[];
  materialSubtotalCents: number;
  materialHandlingCents: number;
  genericSubtotalCents: number;
  guardrailAdjustmentCents: number;
  adjustedGenericSubtotalCents: number;
  genericTaxCents: number;
  genericTotalCents: number;
  depositCents: number;
  balanceDueCents: number;
  reviewTotal: () => string;
}

interface UseEstimatePricingInput {
  serviceType: "painting" | "generic";
  mode: "itemized" | "flat_rate" | "multi_option";
  lineItems: LineItemRow[];
  tiers: OptionTier[];
  flatRate: string;
  taxRate: string;
  sqFt: string;
  prepLevel: number;
  includesTrim: boolean;
  includesCeiling: boolean;
  materialCostDollars: string;
  scopeMaterialsTotalCents: number;
  travelSurcharge: string;
  riskAdjustment: string;
  depositRequired: boolean;
  depositType: DepositType;
  depositPercentage: string;
  depositFixedDollars: string;
  depositDueTrigger: DepositDueTrigger;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useEstimatePricing({
  serviceType, mode, lineItems, tiers, flatRate, taxRate,
  sqFt, prepLevel, includesTrim, includesCeiling, materialCostDollars,
  scopeMaterialsTotalCents, travelSurcharge, riskAdjustment,
  depositRequired, depositType, depositPercentage, depositFixedDollars, depositDueTrigger: _depositDueTrigger,
}: UseEstimatePricingInput): PricingResult {
  const paintingResult = useMemo<PaintingEstimateResult | null>(() => {
    if (serviceType !== "painting") return null;
    const sq = parseFloat(sqFt);
    if (isNaN(sq) || sq <= 0) return null;
    const prep = mapPrepLevel(prepLevel);
    const matCents = parseCents(materialCostDollars);
    const surfaces = [
      { type: "walls" as const, sqft: sq, condition: "good" as const, prep, prime: false, textureMatch: false },
      ...(includesCeiling ? [{ type: "ceiling" as const, sqft: Math.round(sq * 0.35), condition: "good" as const, prep, prime: false, textureMatch: false }] : []),
      ...(includesTrim ? [{ type: "trim" as const, linearFt: Math.round(sq / 8), condition: "good" as const, prep, prime: false, textureMatch: false }] : []),
    ];
    const spec: EstimateSpec = {
      engineVersion: ENGINE_VERSION,
      type: "painting",
      paintQuality: "standard",
      rooms: [{ id: "r1", name: "Main area", coats: 2, surfaces }],
    };
    if (matCents > 0) {
      spec.lineItems = [{
        id: "mat-user",
        description: "Materials & supplies",
        quantity: 1,
        unit: "flat",
        unitLaborCents: 0,
        materialCents: matCents,
      }];
    }
    const r = computeEstimate(spec, CURRENT_RULES);
    return {
      labor_flat_rate_cents: r.summary.laborCents,
      material_cents: r.summary.materialCents,
      material_handling_cents: r.summary.handlingCents,
      total_cents: r.summary.totalCents,
      deposit_cents: r.summary.depositCents,
      balance_cents: r.summary.balanceDueCents,
      internal_labor_cost_cents: r.internalSummary.estimatedCostCents,
      gross_margin_pct: Math.round(r.internalSummary.grossMarginPct * 100),
      gross_margin_cents: r.internalSummary.grossMarginCents,
      effective_sq_ft_rate_cents: sq > 0 ? Math.round(r.summary.laborCents / sq) : 0,
      _spec: spec,
    };
  }, [serviceType, sqFt, prepLevel, includesTrim, includesCeiling, materialCostDollars]);

  const taxRateNum = parseFloat(taxRate) || 0;

  const materialLineItems = lineItems.filter((row) =>
    row.description.toLowerCase().includes("material")
  );
  const materialSubtotalCents =
    materialLineItems.reduce((sum, row) => sum + lineTotal(row), 0) + scopeMaterialsTotalCents;
  const materialHandlingCents = Math.round(materialSubtotalCents * 0.15);

  const genericSubtotalCents =
    mode === "flat_rate"
      ? parseCents(flatRate)
      : lineItems.reduce((sum, row) => sum + lineTotal(row), 0) +
        scopeMaterialsTotalCents +
        materialHandlingCents;
  const guardrailAdjustmentCents = parseCents(travelSurcharge) + parseCents(riskAdjustment);
  const adjustedGenericSubtotalCents = genericSubtotalCents + guardrailAdjustmentCents;
  const genericTaxCents = Math.round((adjustedGenericSubtotalCents * taxRateNum) / 100);
  const genericTotalCents = adjustedGenericSubtotalCents + genericTaxCents;
  const genericDepositPolicy = calculateDepositPolicy({
    deposit_required: depositRequired,
    deposit_type: depositType,
    deposit_percentage: parseFloat(depositPercentage) || 0,
    deposit_fixed_cents: parseCents(depositFixedDollars),
    material_total_cents: materialSubtotalCents,
    total_cents: genericTotalCents,
  });
  const depositCents = serviceType === "painting" && paintingResult
    ? calculateDepositPolicy({
        deposit_required: depositRequired,
        deposit_type: depositType,
        deposit_percentage: parseFloat(depositPercentage) || 0,
        deposit_fixed_cents: parseCents(depositFixedDollars),
        material_total_cents: paintingResult.material_cents,
        total_cents: paintingResult.total_cents,
      }).deposit_cents
    : genericDepositPolicy.deposit_cents;
  const balanceDueCents = (serviceType === "painting" && paintingResult ? paintingResult.total_cents : genericTotalCents) - depositCents;

  function reviewTotal(): string {
    if (serviceType === "painting" && paintingResult) {
      return formatCents(paintingResult.total_cents);
    }
    if (serviceType === "generic") {
      if (mode === "flat_rate") return formatCents(parseCents(flatRate));
      if (mode === "multi_option") {
        const maxTier = Math.max(...tiers.map((t) => t.line_items.reduce((sum, row) => sum + lineTotal(row), 0)));
        return maxTier > 0 ? `up to ${formatCents(maxTier)}` : "—";
      }
      return formatCents(genericTotalCents);
    }
    return "—";
  }

  return {
    paintingResult,
    taxRateNum,
    materialLineItems,
    materialSubtotalCents,
    materialHandlingCents,
    genericSubtotalCents,
    guardrailAdjustmentCents,
    adjustedGenericSubtotalCents,
    genericTaxCents,
    genericTotalCents,
    depositCents,
    balanceDueCents,
    reviewTotal,
  };
}
