type RequestStatus = "pending" | "needs_info" | "duplicate" | "reviewed" | "converted" | "cancelled";
export type RequestRoutingPath =
  | "site_visit"
  | "remote_estimate"
  | "book_work"
  | "pending"
  | null;
type RequestPricingMode = "flat_rate" | "hourly_internal" | null;

export type RequestPrimaryActionKind =
  | "choose_path"
  | "create_estimate"
  | "create_job"
  | "schedule_assessment"
  | "schedule_work"
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
  pending: "Captured — choose how to proceed before scheduling work.",
  needs_info: "Waiting for missing contact or scope details.",
  duplicate: "Matches another request and should not be converted again.",
  reviewed: "Classified — continue with the selected path.",
  converted: "Linked to a project or assessment.",
  cancelled: "Closed and retained in history.",
};

const OUTCOME_META: Record<
  RequestPrimaryActionKind,
  { label: string; detail: string; destination: string }
> = {
  choose_path: {
    label: "Choose how to proceed",
    detail: "Assessment, book work, or remote estimate — required before the next step.",
    destination: "Path",
  },
  create_estimate: {
    label: "Create Estimate",
    detail: "Draft the priceable scope from this request (no visit required).",
    destination: "Estimate",
  },
  create_job: {
    label: "Create Project",
    detail: "Create the work thread first, then continue from the project.",
    destination: "Project",
  },
  schedule_assessment: {
    label: "Schedule Assessment",
    detail: "Book the on-site assessment to capture measurements, photos, and scope.",
    destination: "Assessment",
  },
  schedule_work: {
    label: "Schedule Work Day",
    detail: "Scope is clear enough to book a work appointment (no full assessment required).",
    destination: "Work Day",
  },
  close_request: {
    label: "Close Request",
    detail: "Mark the request closed and keep it in history.",
    destination: "Closed request",
  },
};

function primaryOutcome(input: RequestGuidanceInput): RequestPrimaryActionKind {
  if (input.routing_path === "pending" || input.routing_path == null) {
    return "choose_path";
  }
  if (input.routing_path === "site_visit") {
    return input.job_id ? "schedule_assessment" : "create_job";
  }
  if (input.routing_path === "book_work") {
    return input.job_id ? "schedule_work" : "create_job";
  }
  if (input.routing_path === "remote_estimate") {
    return "create_estimate";
  }
  // Fallback for unexpected values
  return "choose_path";
}

function pathLabels(input: RequestGuidanceInput): { label: string; detail: string } {
  if (input.routing_path === "site_visit") {
    return {
      label: "Assessment first",
      detail: "Start with an on-site assessment, then estimate and schedule work.",
    };
  }
  if (input.routing_path === "book_work") {
    return {
      label: "Book work",
      detail: "Schedule a work day without a full assessment packet.",
    };
  }
  if (input.routing_path === "remote_estimate") {
    return {
      label: "Remote estimate",
      detail: "Go straight to an estimate from notes or photos.",
    };
  }
  if (input.pricing_mode === "hourly_internal") {
    return {
      label: "Time and Materials",
      detail: "Often book work or assess first — choose a path below.",
    };
  }
  return {
    label: "Needs path",
    detail: "Choose assessment, book work, or remote estimate.",
  };
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
  const path = pathLabels(input);

  const recommendedLabel =
    meta?.label ??
    (followUpKind === "view_visit"
      ? "Open Assessment / Visit"
      : followUpKind === "view_job"
        ? "Open Project"
        : "Close Request");
  const recommendedDetail =
    meta?.detail ??
    (followUpKind === "view_visit"
      ? "Continue from the scheduled visit."
      : followUpKind === "view_job"
        ? "Continue from the linked project."
        : "Keep the request closed and review the record in history.");

  const destinationRecord =
    meta?.destination ??
    (followUpKind === "view_visit"
      ? "Visit"
      : followUpKind === "view_job"
        ? "Project"
        : OUTCOME_META.close_request.destination);

  return {
    currentStateLabel: STATE_LABELS[status],
    currentStateDetail: STATE_DETAILS[status],
    requestTypeLabel: path.label,
    requestTypeDetail: path.detail,
    recommendedLabel,
    recommendedDetail,
    destinationRecord,
    primaryActionKind,
    followUpKind,
    followUpHref,
  };
}
