import type { EstimateSpec, GuardrailWarning, PricingRules } from "./types";

export function evaluateGuardrails(
  spec: EstimateSpec,
  totalCents: number,
  grossMarginPct: number,
  lineItemCount: number,
  rules: PricingRules
): GuardrailWarning[] {
  const warnings: GuardrailWarning[] = [];
  const hasMinOverride = spec.overrides?.some((o) => o.rule === "minimum_service_fee") ?? false;
  const hasAdjSurcharge = spec.adjustments?.some(
    (a) => a.type === "surcharge" || a.type === "trip_fee"
  ) ?? false;

  // Below Minimum Service Fee Guardrail (Advisory only per owner preference)
  if (totalCents < rules.minimumTotalCents && !hasMinOverride) {
    const gapCents = rules.minimumTotalCents - totalCents;
    warnings.push({
      code: "BELOW_MINIMUM",
      severity: "warn",
      message: `Total ($${fmt(totalCents)}) is below the $${fmt(rules.minimumTotalCents)} minimum visit fee.`,
      overridable: true,
      suggestion: `Add a $${fmt(gapCents)} Minimum Service Adjustment, or bundle a minor add-on (e.g. smoke detector/battery check).`,
      actionCode: "ADD_MINIMUM_ADJUSTMENT",
    });
  }

  // Low Gross Margin Floor Guardrail (Advisory only)
  if (totalCents >= rules.minimumTotalCents && grossMarginPct < rules.marginFloor) {
    warnings.push({
      code: "BELOW_MARGIN_FLOOR",
      severity: "warn",
      message: `Gross margin (${pct(grossMarginPct)}) is below the ${pct(rules.marginFloor)} target floor.`,
      overridable: true,
      suggestion: "Add 15% material handling, increase labor hours for prep/complexity, or apply MA travel delta (+15%).",
      actionCode: "IMPROVE_MARGIN",
    });
  }

  if (spec.hasMaRegulatedItems) {
    warnings.push({
      code: "MA_REGULATED",
      severity: "warn",
      message: "One or more items may involve licensed-trade gray areas in MA.",
      overridable: true,
      suggestion: "Confirm client authorization or route specialized work to a licensed subcontractor.",
      actionCode: "VERIFY_LICENSED_SUB",
    });
  }

  if (lineItemCount >= 4) {
    warnings.push({
      code: "BLOCK_PRICING_SUGGESTED",
      severity: "warn",
      message: `${lineItemCount} scope items detected.`,
      overridable: true,
      suggestion: "Consider half-day ($515) or full-day ($980) block pricing to simplify invoice and protect margin.",
      actionCode: "APPLY_BLOCK_PRICING",
    });
  }

  if (spec.requiresDryingOrCuring && spec.tripCount !== "multi_trip") {
    warnings.push({
      code: "DRYING_NEEDS_MULTI_TRIP",
      severity: "warn",
      message: "Drying or curing work usually requires multi-trip pricing.",
      overridable: true,
      suggestion: "Set trip count to multi-trip or add a return-trip fee ($75–$150).",
      actionCode: "ADD_MULTI_TRIP",
    });
  }

  if (spec.tripCount === "multi_trip" && !hasAdjSurcharge) {
    warnings.push({
      code: "MULTI_TRIP_NO_SURCHARGE",
      severity: "warn",
      message: "Multi-trip work has no return-trip fee in adjustments.",
      overridable: true,
      suggestion: "Add a trip fee surcharge line item to cover second site visit travel.",
      actionCode: "ADD_TRIP_FEE",
    });
  }

  if (
    (spec.difficultAccess || spec.oldHouseRisk || spec.coordinationRequired || spec.finishExpectation === "premium") &&
    !hasAdjSurcharge
  ) {
    warnings.push({
      code: "RISK_FLAGS_NO_SURCHARGE",
      severity: "warn",
      message: "Risk or premium-condition flags are set without a complexity surcharge.",
      overridable: true,
      suggestion: "Add a 10%–20% complexity surcharge adjustment for old house / difficult access risks.",
      actionCode: "ADD_RISK_SURCHARGE",
    });
  }

  return warnings;
}

function fmt(cents: number): string {
  return (cents / 100).toFixed(2);
}
function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}
