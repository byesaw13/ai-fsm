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
