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

  if (totalCents < rules.minimumTotalCents && !hasMinOverride) {
    warnings.push({
      code: "BELOW_MINIMUM",
      severity: "block",
      message: `Total ($${fmt(totalCents)}) is below the $${fmt(rules.minimumTotalCents)} minimum service fee. Add a structured override to proceed.`,
      overridable: true,
    });
  }

  if (totalCents >= rules.minimumTotalCents && grossMarginPct < rules.marginFloor) {
    warnings.push({
      code: "BELOW_MARGIN_FLOOR",
      severity: "block",
      message: `Gross margin (${pct(grossMarginPct)}) is below the ${pct(rules.marginFloor)} floor. Raise pricing or reduce scope.`,
      overridable: false,
    });
  }

  if (spec.hasMaRegulatedItems) {
    warnings.push({
      code: "MA_REGULATED",
      severity: "warn",
      message: "One or more items may involve licensed-trade gray areas in MA. Confirm authorization or route to a licensed sub.",
      overridable: true,
    });
  }

  if (lineItemCount >= 4) {
    warnings.push({
      code: "BLOCK_PRICING_SUGGESTED",
      severity: "warn",
      message: `${lineItemCount} scope items detected. Consider half-day ($515) or full-day ($980) block pricing.`,
      overridable: true,
    });
  }

  if (spec.requiresDryingOrCuring && spec.tripCount !== "multi_trip") {
    warnings.push({
      code: "DRYING_NEEDS_MULTI_TRIP",
      severity: "warn",
      message: "Drying or curing work usually requires multi-trip pricing.",
      overridable: true,
    });
  }

  if (spec.tripCount === "multi_trip" && !hasAdjSurcharge) {
    warnings.push({
      code: "MULTI_TRIP_NO_SURCHARGE",
      severity: "warn",
      message: "Multi-trip work has no return-trip fee in adjustments.",
      overridable: true,
    });
  }

  if (
    (spec.difficultAccess || spec.oldHouseRisk || spec.coordinationRequired || spec.finishExpectation === "premium") &&
    !hasAdjSurcharge
  ) {
    warnings.push({
      code: "RISK_FLAGS_NO_SURCHARGE",
      severity: "warn",
      message: "Risk or premium-condition flags are set without a surcharge adjustment.",
      overridable: true,
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
