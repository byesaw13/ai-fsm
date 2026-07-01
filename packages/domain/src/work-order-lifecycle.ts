import type { VisitStatus, WorkOrderStatus } from "./statuses";
import { allRequiredCriteriaMet, type CompletionCriterion } from "./completion-criteria";

export interface WorkOrderVisitSnapshot {
  status: VisitStatus;
  scheduled_start: string | Date;
}

export interface DeriveWorkOrderStatusInput {
  currentStatus: WorkOrderStatus;
  visits: WorkOrderVisitSnapshot[];
  completionCriteria: CompletionCriterion[];
  /** Defaults to now(). Injectable for tests. */
  now?: Date;
}

const ACTIVE_FIELD_STATUSES: readonly VisitStatus[] = [
  "dispatched",
  "traveling",
  "arrived",
  "in_progress",
  "waiting",
];

const TERMINAL_VISIT_STATUSES: readonly VisitStatus[] = ["completed", "cancelled"];

/**
 * Pure derivation of work order planning status from child visits and criteria.
 * Manual holds (`waiting`, `cancelled`) are respected unless completion is fully met.
 */
export function deriveWorkOrderStatus({
  currentStatus,
  visits,
  completionCriteria,
  now = new Date(),
}: DeriveWorkOrderStatusInput): WorkOrderStatus {
  if (currentStatus === "cancelled") return "cancelled";
  if (currentStatus === "draft") return "draft";

  const activeVisits = visits.filter((v) => !TERMINAL_VISIT_STATUSES.includes(v.status));
  const allVisitsDone =
    visits.length > 0 &&
    visits.every((v) => TERMINAL_VISIT_STATUSES.includes(v.status)) &&
    visits.some((v) => v.status === "completed");

  if (allVisitsDone && allRequiredCriteriaMet(completionCriteria)) {
    return "completed";
  }

  if (allVisitsDone && !allRequiredCriteriaMet(completionCriteria)) {
    return "dispatched";
  }

  if (currentStatus === "waiting") return "waiting";

  const hasActiveField = visits.some((v) => ACTIVE_FIELD_STATUSES.includes(v.status));
  if (hasActiveField) return "dispatched";

  const hasFutureScheduled = visits.some((v) => {
    if (v.status !== "scheduled") return false;
    const start = v.scheduled_start instanceof Date ? v.scheduled_start : new Date(v.scheduled_start);
    return start.getTime() > now.getTime();
  });
  if (hasFutureScheduled) return "scheduled";

  const hasAnyScheduled = visits.some((v) => v.status === "scheduled");
  if (hasAnyScheduled) return "scheduled";

  return "ready";
}

/** UI label when visits are active but WO DB status is still planning-phase. */
export function derivedWorkOrderUiLabel(
  dbStatus: WorkOrderStatus,
  visits: WorkOrderVisitSnapshot[],
): string | null {
  if (dbStatus === "completed" || dbStatus === "cancelled" || dbStatus === "draft") {
    return null;
  }
  const hasActive = visits.some(
    (v) => v.status === "in_progress" || v.status === "arrived" || v.status === "traveling",
  );
  if (hasActive && dbStatus !== "dispatched") return "In Progress";
  return null;
}