import {
  MINIMUM_SERVICE_FEE_CENTS,
  BUNDLE_MARGIN_FLOOR,
  BUNDLE_DISCOUNT_MIN_TASKS,
  HALF_DAY_RATE_CENTS,
  FULL_DAY_RATE_CENTS,
  type EstimateFinishExpectation,
  type EstimateMinimumOverrideReason,
  type EstimateTripCount,
} from "@ai-fsm/domain";

export { buildClientDocumentFilename } from "@ai-fsm/domain";

export interface EstimateGuardrailInput {
  total_cents: number;
  trip_count: EstimateTripCount;
  requires_drying_or_curing: boolean;
  difficult_access: boolean;
  old_house_risk: boolean;
  coordination_required: boolean;
  finish_expectation: EstimateFinishExpectation;
  travel_surcharge_cents: number;
  risk_adjustment_cents: number;
  minimum_service_override_reason: EstimateMinimumOverrideReason | null;
  // New in pricing upgrade
  margin_pct: number | null;
  has_ma_regulated_items: boolean;
  line_item_count: number;
}

export interface EstimateGuardrailIssue {
  field: string;
  message: string;
}

export interface EstimateGuardrailReview {
  status: "passed" | "blocked";
  blockers: EstimateGuardrailIssue[];
  warnings: EstimateGuardrailIssue[];
}

export function reviewEstimateGuardrails(input: EstimateGuardrailInput): EstimateGuardrailReview {
  const blockers: EstimateGuardrailIssue[] = [];
  const warnings: EstimateGuardrailIssue[] = [];

  if (
    input.total_cents < MINIMUM_SERVICE_FEE_CENTS &&
    !input.minimum_service_override_reason
  ) {
    blockers.push({
      field: "minimum_service_override_reason",
      message: "Estimate is below the $185 minimum service value and needs a structured override.",
    });
  }

  if (input.margin_pct !== null && input.margin_pct < BUNDLE_MARGIN_FLOOR) {
    blockers.push({
      field: "margin_pct",
      message: `Estimate is below the 30% margin floor (current: ${Math.round(input.margin_pct * 100)}%). Raise pricing or reduce scope before sending.`,
    });
  }

  if (input.has_ma_regulated_items) {
    warnings.push({
      field: "legal",
      message:
        "One or more line items involve licensed-trade gray areas in Massachusetts. Confirm authorization to perform this work or route to a licensed subcontractor.",
    });
  }

  if (input.line_item_count >= BUNDLE_DISCOUNT_MIN_TASKS) {
    warnings.push({
      field: "pricing",
      message: `${input.line_item_count} tasks detected. Consider half-day ($${(HALF_DAY_RATE_CENTS / 100).toFixed(0)}) or full-day ($${(FULL_DAY_RATE_CENTS / 100).toFixed(0)}) block pricing instead of per-task rates.`,
    });
  }

  if (input.requires_drying_or_curing && input.trip_count !== "multi_trip") {
    warnings.push({
      field: "trip_count",
      message: "Drying or curing work usually requires multi-trip pricing.",
    });
  }

  if (
    input.trip_count === "multi_trip" &&
    input.risk_adjustment_cents === 0
  ) {
    warnings.push({
      field: "risk_adjustment_cents",
      message: "Multi-trip work has no return-trip or risk adjustment captured.",
    });
  }

  if (
    (input.difficult_access ||
      input.old_house_risk ||
      input.coordination_required ||
      input.finish_expectation === "premium") &&
    input.risk_adjustment_cents === 0
  ) {
    warnings.push({
      field: "risk_adjustment_cents",
      message: "Risk or premium-condition flags are set without a risk adjustment.",
    });
  }

  if (blockers.length === 0 && warnings.length === 0) {
    warnings.push({
      field: "pricing",
      message: "Pricing guardrails passed.",
    });
  }

  return {
    status: blockers.length > 0 ? "blocked" : "passed",
    blockers,
    warnings,
  };
}

export function computeConditionTier(flags: {
  old_house_risk: boolean;
  difficult_access: boolean;
  trip_count: string;
  requires_drying_or_curing: boolean;
  coordination_required: boolean;
}): "green" | "yellow" | "red" {
  if (
    flags.old_house_risk ||
    flags.difficult_access ||
    flags.trip_count === "multi_trip" ||
    flags.requires_drying_or_curing ||
    flags.coordination_required
  ) {
    return "yellow";
  }
  return "green";
}
