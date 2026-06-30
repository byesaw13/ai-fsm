import {
  MINIMUM_SERVICE_FEE_CENTS,
  BUNDLE_MARGIN_FLOOR,
  BUNDLE_DISCOUNT_MIN_TASKS,
  HALF_DAY_RATE_CENTS,
  FULL_DAY_RATE_CENTS,
  evaluateGuardrails,
  CURRENT_RULES,
  ENGINE_VERSION,
  type EstimateFinishExpectation,
  type EstimateMinimumOverrideReason,
  type EstimateTripCount,
  type ComputedMaterial,
  type EstimateSpec,
  type GuardrailWarning,
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

const WARNING_CODE_TO_FIELD: Record<string, string> = {
  BELOW_MINIMUM: "minimum_service_override_reason",
  BELOW_MARGIN_FLOOR: "margin_pct",
  MA_REGULATED: "legal",
  BLOCK_PRICING_SUGGESTED: "pricing",
  DRYING_NEEDS_MULTI_TRIP: "trip_count",
  MULTI_TRIP_NO_SURCHARGE: "risk_adjustment_cents",
  RISK_FLAGS_NO_SURCHARGE: "risk_adjustment_cents",
};

function webInputToEngineSpec(input: EstimateGuardrailInput): EstimateSpec {
  const adjustments: NonNullable<EstimateSpec["adjustments"]> = [];
  if (input.travel_surcharge_cents > 0) {
    adjustments.push({
      id: "guardrail-travel",
      type: "trip_fee",
      label: "Travel surcharge",
      amountCents: input.travel_surcharge_cents,
    });
  }
  if (input.risk_adjustment_cents > 0) {
    adjustments.push({
      id: "guardrail-risk",
      type: "surcharge",
      label: "Risk adjustment",
      amountCents: input.risk_adjustment_cents,
    });
  }

  const overrides = input.minimum_service_override_reason
    ? [{
        rule: "minimum_service_fee",
        reason: input.minimum_service_override_reason,
        approvedBy: "owner",
        approvedAt: new Date().toISOString(),
      }]
    : undefined;

  return {
    engineVersion: ENGINE_VERSION,
    type: "general",
    tripCount: input.trip_count,
    requiresDryingOrCuring: input.requires_drying_or_curing,
    difficultAccess: input.difficult_access,
    oldHouseRisk: input.old_house_risk,
    coordinationRequired: input.coordination_required,
    finishExpectation: input.finish_expectation,
    hasMaRegulatedItems: input.has_ma_regulated_items,
    ...(adjustments.length > 0 ? { adjustments } : {}),
    ...(overrides ? { overrides } : {}),
  };
}

function engineWarningToIssue(warning: GuardrailWarning): EstimateGuardrailIssue {
  return {
    field: WARNING_CODE_TO_FIELD[warning.code] ?? warning.code.toLowerCase(),
    message: warning.message,
  };
}

export function reviewEstimateGuardrails(input: EstimateGuardrailInput): EstimateGuardrailReview {
  const spec = webInputToEngineSpec(input);
  const grossMarginPct = input.margin_pct ?? 1;
  const warnings = evaluateGuardrails(
    spec,
    input.total_cents,
    grossMarginPct,
    input.line_item_count,
    CURRENT_RULES
  );

  const blockers = warnings
    .filter((w) => w.severity === "block")
    .map(engineWarningToIssue);
  const engineWarns = warnings
    .filter((w) => w.severity === "warn")
    .map(engineWarningToIssue);

  const resultWarnings = [...engineWarns];
  if (blockers.length === 0 && resultWarnings.length === 0) {
    resultWarnings.push({
      field: "pricing",
      message: "Pricing guardrails passed.",
    });
  }

  return {
    status: blockers.length > 0 ? "blocked" : "passed",
    blockers,
    warnings: resultWarnings,
  };
}

// ---------------------------------------------------------------------------
// Trade-scoped material validation
// ---------------------------------------------------------------------------

const TRADE_MATERIAL_BLOCKLIST: Record<string, string[]> = {
  flooring: ["thinset", "grout", "tile spacers", "backer board", "joint compound", "mesh tape", "drywall mud"],
  painting: ["thinset", "grout", "tile spacers", "backer board", "self-leveling", "lvp underlayment"],
  plumbing: ["thinset", "grout", "tile spacers", "joint compound", "mesh tape", "lvp underlayment"],
  carpentry: ["thinset", "grout", "tile spacers", "self-leveling", "lvp underlayment"],
  drywall: ["thinset", "grout", "tile spacers", "lvp underlayment", "self-leveling", "feather finish"],
};

const CATEGORY_TO_TRADE: Record<string, string> = {
  painting_finishes: "painting",
  carpentry_furniture: "carpentry",
  general_repairs: "drywall",
  mounting_installs: "mounting",
  outdoor_seasonal: "outdoor",
};

export interface MaterialValidationResult {
  allowed: ComputedMaterial[];
  blocked: ComputedMaterial[];
}

export function validateMaterialsForTrade(
  materials: ComputedMaterial[],
  tradeDetected: string
): MaterialValidationResult {
  const raw = tradeDetected.toLowerCase();
  const tradeKey = CATEGORY_TO_TRADE[raw] ?? raw;
  const blocklist = TRADE_MATERIAL_BLOCKLIST[tradeKey] ?? [];
  const allowed: ComputedMaterial[] = [];
  const blocked: ComputedMaterial[] = [];

  for (const item of materials) {
    const nameLower = item.material.material_name.toLowerCase();
    const isBlocked = blocklist.some((term) => nameLower.includes(term));
    if (isBlocked) {
      blocked.push(item);
      console.warn(`[validateMaterialsForTrade] Blocked cross-trade material "${item.material.material_name}" for trade "${tradeDetected}"`);
    } else {
      allowed.push(item);
    }
  }

  return { allowed, blocked };
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

// Re-export engine constants used in tests
export { MINIMUM_SERVICE_FEE_CENTS, BUNDLE_MARGIN_FLOOR, BUNDLE_DISCOUNT_MIN_TASKS, HALF_DAY_RATE_CENTS, FULL_DAY_RATE_CENTS };