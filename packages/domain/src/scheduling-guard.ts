export type SchedulingGuardError =
  | "JOB_NOT_FOUND"
  | "ESTIMATE_NOT_APPROVED"
  | "JOB_NOT_SCHEDULABLE"
  | "ACTIVE_VISIT_EXISTS"
  | "VISIT_OVERLAP";

export interface SchedulingGuardResult {
  ok: boolean;
  error?: SchedulingGuardError;
}

/**
 * Field-active visit statuses that block scheduling another visit
 * (crew is already on a live field day for this project).
 * Future `scheduled` visits do NOT block — multi-day jobs need many open days.
 */
export const FIELD_ACTIVE_VISIT_STATUSES = [
  "dispatched",
  "traveling",
  "arrived",
  "in_progress",
  "waiting",
] as const;

/** Project statuses that may receive additional calendar visits. */
export const SCHEDULABLE_JOB_STATUSES = [
  "draft",
  "quoted",
  "scheduled",
  "in_progress",
] as const;

/**
 * Pure function: validates scheduling preconditions from already-fetched data.
 *
 * @param fieldActiveVisitCount visits currently in field execution on this job
 *   (NOT future `scheduled` visits — those must coexist for multi-day work).
 * @param overlappingVisitCount optional: visits whose time window overlaps the new slot
 */
export function checkSchedulingPreconditions(opts: {
  jobStatus: string | null;
  /** @deprecated use fieldActiveVisitCount — kept for older callers */
  activeVisitCount?: number;
  fieldActiveVisitCount?: number;
  overlappingVisitCount?: number;
}): SchedulingGuardResult {
  if (!opts.jobStatus) return { ok: false, error: "JOB_NOT_FOUND" };

  const fieldActive =
    opts.fieldActiveVisitCount ?? opts.activeVisitCount ?? 0;
  if (fieldActive > 0) return { ok: false, error: "ACTIVE_VISIT_EXISTS" };

  if ((opts.overlappingVisitCount ?? 0) > 0) {
    return { ok: false, error: "VISIT_OVERLAP" };
  }

  if (!(SCHEDULABLE_JOB_STATUSES as readonly string[]).includes(opts.jobStatus)) {
    return { ok: false, error: "JOB_NOT_SCHEDULABLE" };
  }
  return { ok: true };
}
