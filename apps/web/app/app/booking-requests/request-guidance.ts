type RequestStatus = "pending" | "needs_info" | "duplicate" | "reviewed" | "converted" | "cancelled";
type RequestRoutingPath = "site_visit" | "remote_estimate" | "pending" | null;
type RequestPricingMode = "flat_rate" | "hourly_internal" | null;

export type RequestPrimaryActionKind =
  | "create_estimate"
  | "create_job"
  | "schedule_walkthrough"
  | "close_request";

export type RequestFollowUpKind = "view_job" | "view_visit" | null;

export type RequestGuidance = {
  currentStateLabel: string;
  currentStateDetail: string;
  requestTypeLabel: string;
  requestTypeDetail: string;
  recommendedLabel: string;
  recommendedDetail: string;
  destinationRecord: string;
  primaryActionKind: RequestPrimaryActionKind | null;
  followUpKind: RequestFollowUpKind;
  followUpHref: string | null;
};

export type RequestGuidanceInput = {
  status: RequestStatus | string;
  pricing_mode: RequestPricingMode;
  routing_path: RequestRoutingPath;
  job_id: string | null;
  visit_id: string | null;
  walkthrough_score: number | null;
  service_category?: string | null;
};

const STATE_LABELS: Record<RequestStatus, string> = {
  pending: "New request",
  needs_info: "Waiting for information",
  duplicate: "Duplicate request",
  reviewed: "Ready to route",
  converted: "Converted",
  cancelled: "Closed request",
};

const STATE_DETAILS: Record<RequestStatus, string> = {
  pending: "Captured and ready to classify.",
  needs_info: "Waiting for missing contact or scope details.",
  duplicate: "Matches another request and should not be converted again.",
  reviewed: "Classified and ready for the next action.",
  converted: "Linked to a job or walkthrough.",
  cancelled: "Closed and retained in history.",
};

const OUTCOME_META: Record<RequestPrimaryActionKind, { label: string; detail: string; destination: string }> = {
  create_estimate: {
    label: "Create Estimate",
    detail: "Draft the priceable scope from this request.",
    destination: "Estimate",
  },
  create_job: {
    label: "Create Job",
    detail: "Create the work thread first, then continue from the job.",
    destination: "Job",
  },
  schedule_walkthrough: {
    label: "Schedule Walkthrough",
    detail: "Book the site visit that will capture measurements and scope.",
    destination: "Visit",
  },
  close_request: {
    label: "Close Request",
    detail: "Mark the request closed and keep it in history.",
    destination: "Closed request",
  },
};

function primaryOutcome(input: RequestGuidanceInput): RequestPrimaryActionKind {
  if (input.routing_path === "site_visit") return input.job_id ? "schedule_walkthrough" : "create_job";
  if (input.routing_path === "remote_estimate") return "create_estimate";
  if (input.pricing_mode === "hourly_internal") return "create_job";

  if (input.walkthrough_score !== null) {
    return input.walkthrough_score >= 60 && input.job_id ? "schedule_walkthrough" : "create_job";
  }

  return "create_estimate";
}

function destinationFor(actionKind: RequestPrimaryActionKind): string {
  return OUTCOME_META[actionKind].destination;
}

export function getRequestGuidance(input: RequestGuidanceInput): RequestGuidance {
  const status = (input.status in STATE_LABELS ? input.status : "pending") as RequestStatus;

  let primaryActionKind: RequestPrimaryActionKind | null;
  let followUpKind: RequestFollowUpKind = null;
  let followUpHref: string | null = null;

  if (status === "converted") {
    primaryActionKind = null;
    if (input.visit_id) {
      followUpKind = "view_visit";
      followUpHref = `/app/visits/${input.visit_id}`;
    } else if (input.job_id) {
      followUpKind = "view_job";
      followUpHref = `/app/jobs/${input.job_id}`;
    } else {
      primaryActionKind = "close_request";
    }
  } else if (status === "duplicate" || status === "cancelled" || status === "needs_info") {
    primaryActionKind = "close_request";
  } else {
    primaryActionKind = primaryOutcome(input);
  }

  const meta = primaryActionKind ? OUTCOME_META[primaryActionKind] : null;
  const requestTypeLabel =
    input.pricing_mode === "hourly_internal"
      ? "Time and Materials"
      : input.routing_path === "site_visit"
        ? "Walkthrough first"
        : input.routing_path === "remote_estimate"
          ? "Fixed Bid"
          : "Needs review";

  const requestTypeDetail =
    input.pricing_mode === "hourly_internal"
      ? "Open-ended repair work should become a job first."
      : input.routing_path === "site_visit"
        ? "This request should start with a walkthrough."
        : input.routing_path === "remote_estimate"
          ? "This request should go straight to an estimate."
          : "Use the job-fit details to classify the request.";

  const recommendedLabel = meta?.label ?? (followUpKind === "view_visit" ? "Open Walkthrough" : followUpKind === "view_job" ? "Open Job" : "Close Request");
  const recommendedDetail = meta?.detail ?? (followUpKind === "view_visit" ? "Continue from the scheduled walkthrough." : followUpKind === "view_job" ? "Continue from the linked job." : "Keep the request closed and review the record in history.");

  const destinationRecord = meta?.destination ?? (followUpKind === "view_visit" ? "Visit" : followUpKind === "view_job" ? "Job" : destinationFor("close_request"));

  return {
    currentStateLabel: STATE_LABELS[status],
    currentStateDetail: STATE_DETAILS[status],
    requestTypeLabel,
    requestTypeDetail,
    recommendedLabel,
    recommendedDetail,
    destinationRecord,
    primaryActionKind,
    followUpKind,
    followUpHref,
  };
}
