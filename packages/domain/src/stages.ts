// Customer-visible pipeline stages — a presentation layer over frozen DB statuses.
// DB status enums (JobStatus, EstimateStatus, etc.) are never changed by this module.
// All functions are pure and side-effect-free.

export type CustomerStage = "intake" | "estimate" | "accepted" | "scheduled" | "completed";

export const CUSTOMER_STAGE_LABELS: Record<CustomerStage, string> = {
  intake:    "Intake",
  estimate:  "Estimate",
  accepted:  "Accepted",
  scheduled: "Scheduled",
  completed: "Completed",
};

export const CUSTOMER_STAGE_ORDER: CustomerStage[] = [
  "intake",
  "estimate",
  "accepted",
  "scheduled",
  "completed",
];

export const CUSTOMER_STAGE_COLORS: Record<CustomerStage, { bg: string; fg: string }> = {
  intake:    { bg: "#f3f4f6", fg: "#374151" },
  estimate:  { bg: "#dbeafe", fg: "#1e40af" },
  accepted:  { bg: "#ede9fe", fg: "#5b21b6" },
  scheduled: { bg: "#fef3c7", fg: "#92400e" },
  completed: { bg: "#d1fae5", fg: "#065f46" },
};

/**
 * Derive the customer-visible stage from internal DB state.
 *
 * Mapping rules (non-destructive — DB statuses unchanged):
 *   draft                           → intake
 *   quoted + no approved estimate   → estimate
 *   quoted + approved + no visit    → accepted
 *   quoted + active visit           → scheduled (visit created after approval)
 *   scheduled | in_progress         → scheduled
 *   completed | invoiced | cancelled→ completed
 */
export function deriveCustomerStage({
  jobStatus,
  hasApprovedEstimate = false,
  hasActiveVisit = false,
}: {
  jobStatus: string;
  hasApprovedEstimate?: boolean;
  hasActiveVisit?: boolean;
}): CustomerStage {
  switch (jobStatus) {
    case "draft":
      return "intake";
    case "quoted":
      if (hasActiveVisit) return "scheduled";
      return hasApprovedEstimate ? "accepted" : "estimate";
    case "scheduled":
    case "in_progress":
      return "scheduled";
    case "completed":
    case "invoiced":
    case "cancelled":
      return "completed";
    default:
      return "intake";
  }
}

/**
 * Derive stage from portal-visible document statuses.
 * Used when job records are not available (e.g. client portal estimates-only view).
 *
 * Precedence: completed > scheduled > accepted > estimate > intake
 */
export function derivePortalStage({
  hasOpenInvoice = false,
  hasPaidInvoice = false,
  hasApprovedEstimate = false,
  hasSentEstimate = false,
  hasScheduledVisit = false,
}: {
  hasOpenInvoice?: boolean;
  hasPaidInvoice?: boolean;
  hasApprovedEstimate?: boolean;
  hasSentEstimate?: boolean;
  hasScheduledVisit?: boolean;
}): CustomerStage {
  if (hasPaidInvoice || hasOpenInvoice) return "completed";
  if (hasScheduledVisit) return "scheduled";
  if (hasApprovedEstimate) return "accepted";
  if (hasSentEstimate) return "estimate";
  return "intake";
}

// ---------------------------------------------------------------------------
// Operational pipeline stages — internal view of the full job lifecycle.
// Never stored in the DB; always derived from facts.
// CustomerStage (above) is a 5-stage simplification used in client-facing UI.
// ---------------------------------------------------------------------------

export const PIPELINE_STAGE_ORDER = [
  "new_lead",
  "estimate_needed",
  "estimate_sent",
  "approved_ready",
  "scheduled",
  "in_progress",
  "waiting",
  "completed",
  "invoiced",
  "archived",
] as const;

export type PipelineStage = typeof PIPELINE_STAGE_ORDER[number];

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  new_lead:        "New Intake",
  estimate_needed: "Estimate Needed",
  estimate_sent:   "Estimate Sent",
  approved_ready:  "Approved / Ready",
  scheduled:       "Scheduled",
  in_progress:     "In Progress",
  waiting:         "Waiting",
  completed:       "Completed",
  invoiced:        "Invoiced / Paid",
  archived:        "Archived",
};

export const PIPELINE_STAGE_ACTIONS: Record<PipelineStage, string> = {
  new_lead:        "Review intake",
  estimate_needed: "Create estimate",
  estimate_sent:   "Follow up",
  approved_ready:  "Schedule visit",
  scheduled:       "Prepare visit",
  in_progress:     "Complete work",
  waiting:         "Resolve blocker",
  completed:       "Send invoice",
  invoiced:        "Collect payment",
  archived:        "Closed",
};

export type PipelineStageFacts = {
  jobStatus: string;
  subStatus?: string | null;
  bookingStatus?: string | null;
  hasBookingRequest?: boolean;
  estimateCount?: number;
  sentEstimateCount?: number;
  approvedEstimateCount?: number;
  activeVisitCount?: number;
  inProgressVisitCount?: number;
  completedVisitCount?: number;
  unpaidInvoiceCount?: number;
  paidInvoiceCount?: number;
};

function _count(value: number | undefined): number {
  return value ?? 0;
}

export function derivePipelineStage(facts: PipelineStageFacts): PipelineStage {
  if (facts.jobStatus === "cancelled") return "archived";

  if (facts.jobStatus === "invoiced" || _count(facts.paidInvoiceCount) > 0) return "invoiced";
  if (_count(facts.unpaidInvoiceCount) > 0) return "invoiced";

  if (facts.jobStatus === "completed" || _count(facts.completedVisitCount) > 0) return "completed";

  if (
    facts.subStatus === "waiting_parts" ||
    facts.subStatus === "customer_hold" ||
    facts.subStatus === "weather_hold"
  ) {
    return "waiting";
  }

  if (facts.jobStatus === "in_progress" || _count(facts.inProgressVisitCount) > 0) return "in_progress";

  if (facts.jobStatus === "scheduled" || _count(facts.activeVisitCount) > 0) return "scheduled";

  if (_count(facts.approvedEstimateCount) > 0) return "approved_ready";

  if (_count(facts.sentEstimateCount) > 0 || facts.jobStatus === "quoted") return "estimate_sent";

  if (
    facts.hasBookingRequest &&
    (facts.bookingStatus === "pending" ||
      facts.bookingStatus === "needs_info" ||
      facts.bookingStatus === "duplicate" ||
      facts.bookingStatus === "reviewed")
  ) {
    return "new_lead";
  }

  return "estimate_needed";
}

export function getPipelineNextAction(stage: PipelineStage): string {
  return PIPELINE_STAGE_ACTIONS[stage];
}
