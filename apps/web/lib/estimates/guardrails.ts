import {
  MINIMUM_SERVICE_FEE_CENTS,
  type ClientDocumentStatus,
  type ClientDocumentType,
  type EstimateFinishExpectation,
  type EstimateMinimumOverrideReason,
  type EstimateTripCount,
} from "@ai-fsm/domain";

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
      message: "Estimate is below the $150 minimum service value and needs a structured override.",
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

function sanitizeFilenamePart(value: string, fallback: string): string {
  const sanitized = value
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "")
    .slice(0, 48);
  return sanitized || fallback;
}

function clientLastName(clientName: string | null | undefined): string {
  if (!clientName) return "UnknownClient";
  const parts = clientName.trim().split(/\s+/);
  return sanitizeFilenamePart(parts.at(-1) ?? clientName, "UnknownClient");
}

function titleToken(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("");
}

export function buildClientDocumentFilename(input: {
  date: string | Date;
  clientName: string | null | undefined;
  jobType: string | null | undefined;
  documentType: ClientDocumentType;
  status: ClientDocumentStatus;
}): string {
  const date =
    input.date instanceof Date
      ? input.date.toISOString().slice(0, 10)
      : input.date.slice(0, 10);

  return [
    date,
    clientLastName(input.clientName),
    sanitizeFilenamePart(titleToken(input.jobType ?? "Job"), "Job"),
    sanitizeFilenamePart(titleToken(input.documentType), "Document"),
    sanitizeFilenamePart(titleToken(input.status), "Status"),
  ].join("_");
}
