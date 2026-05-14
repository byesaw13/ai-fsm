// Pipeline stages are always derived — never stored in the database.
// See docs/architecture/domain-language.md for the canonical stage definitions.

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
  new_lead:        "New Lead",
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
  new_lead:        "Review lead",
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

function count(value: number | undefined): number {
  return value ?? 0;
}

export function derivePipelineStage(facts: PipelineStageFacts): PipelineStage {
  // Archived: explicitly cancelled
  if (facts.jobStatus === "cancelled") {
    return "archived";
  }

  // Invoiced / Paid: any paid invoice, or job marked invoiced
  if (facts.jobStatus === "invoiced" || count(facts.paidInvoiceCount) > 0) {
    return "invoiced";
  }

  // Invoiced (unpaid): invoice sent but not yet paid
  if (count(facts.unpaidInvoiceCount) > 0) {
    return "invoiced";
  }

  // Completed: work done, invoice not yet issued
  if (facts.jobStatus === "completed" || count(facts.completedVisitCount) > 0) {
    return "completed";
  }

  // Waiting: blocked sub-status (parts, customer, etc.)
  if (
    facts.subStatus === "waiting_parts" ||
    facts.subStatus === "waiting_customer" ||
    facts.subStatus === "waiting_weather"
  ) {
    return "waiting";
  }

  // In Progress: visit underway
  if (facts.jobStatus === "in_progress" || count(facts.inProgressVisitCount) > 0) {
    return "in_progress";
  }

  // Scheduled: visit booked
  if (facts.jobStatus === "scheduled" || count(facts.activeVisitCount) > 0) {
    return "scheduled";
  }

  // Approved / Ready: estimate approved, not yet scheduled
  if (count(facts.approvedEstimateCount) > 0) {
    return "approved_ready";
  }

  // Estimate Sent: estimate sent, awaiting response
  if (count(facts.sentEstimateCount) > 0 || facts.jobStatus === "quoted") {
    return "estimate_sent";
  }

  // New Lead: unreviewed intake or intake in review
  if (
    facts.hasBookingRequest &&
    (facts.bookingStatus === "pending" ||
      facts.bookingStatus === "needs_info" ||
      facts.bookingStatus === "duplicate" ||
      facts.bookingStatus === "reviewed")
  ) {
    return "new_lead";
  }

  // Estimate Needed: manual draft job with no estimate
  if (count(facts.estimateCount) === 0) {
    return "estimate_needed";
  }

  return "estimate_needed";
}

export function getPipelineNextAction(stage: PipelineStage): string {
  return PIPELINE_STAGE_ACTIONS[stage];
}
