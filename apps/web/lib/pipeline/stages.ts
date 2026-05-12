export const PIPELINE_STAGE_ORDER = [
  "new_intake",
  "needs_review",
  "scope_ready",
  "estimate_needed",
  "estimate_sent",
  "approved_ready",
  "scheduled",
  "in_field",
  "complete_needs_invoice",
  "invoice_sent",
  "paid_closed",
] as const;

export type PipelineStage = typeof PIPELINE_STAGE_ORDER[number];

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  new_intake: "New Intake",
  needs_review: "Needs Review",
  scope_ready: "Scope Ready",
  estimate_needed: "Estimate Needed",
  estimate_sent: "Estimate Sent",
  approved_ready: "Approved / Ready",
  scheduled: "Scheduled",
  in_field: "In Field",
  complete_needs_invoice: "Complete / Invoice",
  invoice_sent: "Invoice Sent",
  paid_closed: "Paid / Closed",
};

export const PIPELINE_STAGE_ACTIONS: Record<PipelineStage, string> = {
  new_intake: "Review intake",
  needs_review: "Resolve intake",
  scope_ready: "Create estimate",
  estimate_needed: "Create estimate",
  estimate_sent: "Follow up",
  approved_ready: "Schedule visit",
  scheduled: "Prepare visit",
  in_field: "Complete work",
  complete_needs_invoice: "Create final invoice",
  invoice_sent: "Collect payment",
  paid_closed: "Closed",
};

export type PipelineStageFacts = {
  jobStatus: string;
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
  if (facts.jobStatus === "invoiced" || count(facts.paidInvoiceCount) > 0) {
    return "paid_closed";
  }

  if (count(facts.unpaidInvoiceCount) > 0) {
    return "invoice_sent";
  }

  if (facts.jobStatus === "completed" || count(facts.completedVisitCount) > 0) {
    return "complete_needs_invoice";
  }

  if (facts.jobStatus === "in_progress" || count(facts.inProgressVisitCount) > 0) {
    return "in_field";
  }

  if (facts.jobStatus === "scheduled" || count(facts.activeVisitCount) > 0) {
    return "scheduled";
  }

  if (count(facts.approvedEstimateCount) > 0) {
    return "approved_ready";
  }

  if (count(facts.sentEstimateCount) > 0 || facts.jobStatus === "quoted") {
    return "estimate_sent";
  }

  if (facts.hasBookingRequest && facts.bookingStatus === "pending") {
    return "new_intake";
  }

  if (
    facts.hasBookingRequest &&
    (facts.bookingStatus === "needs_info" || facts.bookingStatus === "duplicate")
  ) {
    return "needs_review";
  }

  if (facts.hasBookingRequest && facts.bookingStatus === "reviewed") {
    return "scope_ready";
  }

  if (count(facts.estimateCount) === 0) {
    return "estimate_needed";
  }

  return "scope_ready";
}

export function getPipelineNextAction(stage: PipelineStage): string {
  return PIPELINE_STAGE_ACTIONS[stage];
}
