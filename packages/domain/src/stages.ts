// Customer-visible pipeline stages — a presentation layer over frozen DB statuses.
// DB status enums (JobStatus, EstimateStatus, etc.) are never changed by this module.
// All functions are pure and side-effect-free.

export type CustomerStage = "intake" | "estimate" | "accepted" | "scheduled" | "completed";

export const CUSTOMER_STAGE_LABELS: Record<CustomerStage, string> = {
  intake:    "Request",
  estimate:  "Estimate",
  accepted:  "Approved",
  scheduled:       "Scheduled",
  completed: "Closeout",
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
  new_lead:        "Request",
  estimate_needed: "Needs Estimate",
  estimate_sent:   "Estimate Sent",
  approved_ready:  "Ready to Schedule",
  scheduled:       "Scheduled",
  in_progress:     "Working",
  waiting:         "On Hold",
  completed: "Ready for Closeout",
  invoiced:  "Invoiced",
  archived:   "Closed",
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
  executionActiveVisitCount?: number;
  executionInProgressCount?: number;
  preSaleOpenSiteVisitCount?: number;
  completedPreSaleSiteVisit?: boolean;
  expiredEstimateCount?: number;
  completedVisitCount?: number;
  /**
   * Final/standard invoices only (never deposits).
   * paid = final/standard paid; unpaid = final/standard sent|partial|overdue.
   */
  unpaidInvoiceCount?: number;
  paidInvoiceCount?: number;
  /**
   * Field quiet + work packets done, but owner has not explicitly completed
   * the project yet. Presentation-only — does not set jobs.status.
   */
  readyForCloseout?: boolean;
  /** Open (non-terminal) work orders still on the project. */
  openWorkOrderCount?: number;
};

function _count(value: number | undefined): number {
  return value ?? 0;
}

export function derivePipelineStage(facts: PipelineStageFacts): PipelineStage {
  if (facts.jobStatus === "cancelled") return "archived";

  // Final/standard billing only — paid deposits must not jump to Invoiced.
  if (facts.jobStatus === "invoiced" || _count(facts.paidInvoiceCount) > 0) return "invoiced";
  if (_count(facts.unpaidInvoiceCount) > 0) return "invoiced";

  // Owner-completed project, or field ready for owner closeout review.
  // Completing a visit alone never forces this (see readyForCloseout).
  if (facts.jobStatus === "completed" || facts.readyForCloseout) return "completed";

  if (
    facts.subStatus === "waiting_parts" ||
    facts.subStatus === "customer_hold" ||
    facts.subStatus === "weather_hold"
  ) {
    return "waiting";
  }

  const executionInProgress = _count(
    facts.executionInProgressCount ?? facts.inProgressVisitCount
  );
  if (executionInProgress > 0) return "in_progress";

  const executionActive = _count(
    facts.executionActiveVisitCount ?? facts.activeVisitCount
  );
  if (executionActive > 0) return "scheduled";

  // Multi-day: completed work days (or open WO) while project still open = Working.
  // Do not force Working for bare in_progress left over from pre-sale noise.
  if (
    (facts.jobStatus === "in_progress" || facts.jobStatus === "scheduled") &&
    (_count(facts.completedVisitCount) > 0 ||
      _count(facts.openWorkOrderCount) > 0 ||
      _count(facts.approvedEstimateCount) > 0)
  ) {
    return "in_progress";
  }

  if (facts.jobStatus === "scheduled") return "scheduled";

  if (_count(facts.approvedEstimateCount) > 0) return "approved_ready";

  if (_count(facts.sentEstimateCount) > 0 || facts.jobStatus === "quoted") return "estimate_sent";

  // Pre-sale site visits still need an estimate before execution.
  if (
    _count(facts.preSaleOpenSiteVisitCount) > 0 &&
    _count(facts.sentEstimateCount) === 0 &&
    _count(facts.approvedEstimateCount) === 0
  ) {
    return "estimate_needed";
  }

  if (facts.completedPreSaleSiteVisit && _count(facts.estimateCount) === 0) {
    return "estimate_needed";
  }

  if (
    facts.hasBookingRequest &&
    (facts.bookingStatus === "pending" ||
      facts.bookingStatus === "needs_info" ||
      facts.bookingStatus === "duplicate" ||
      facts.bookingStatus === "reviewed" ||
      facts.bookingStatus === "assessment_booked" ||
      facts.bookingStatus === "estimated")
  ) {
    return "new_lead";
  }

  // T&M / day jobs: no estimate required. Treat as ready to schedule rather
  // than "Needs Estimate" so the pipeline is Schedule → Working → Closeout.
  return "approved_ready";
}

/**
 * Field work is quiet and packets are done — owner should complete + bill.
 * Pure helper so job page / WhatNext share one definition.
 */
export function isReadyForCloseout(facts: {
  jobStatus: string;
  executionActiveVisitCount?: number;
  completedVisitCount?: number;
  openWorkOrderCount?: number;
  workOrderCount?: number;
}): boolean {
  if (
    facts.jobStatus === "completed" ||
    facts.jobStatus === "invoiced" ||
    facts.jobStatus === "cancelled"
  ) {
    return false;
  }
  if (_count(facts.executionActiveVisitCount) > 0) return false;
  if (_count(facts.completedVisitCount) === 0) return false;
  // All work orders finished (or none exist but execution visits were done).
  if (_count(facts.openWorkOrderCount) > 0) return false;
  return true;
}
