export type SchedulingGuardError =
  | "JOB_NOT_FOUND"
  | "ESTIMATE_NOT_APPROVED"
  | "JOB_NOT_SCHEDULABLE"
  | "ACTIVE_VISIT_EXISTS";

export interface SchedulingGuardResult {
  ok: boolean;
  error?: SchedulingGuardError;
}

/** Pure function: validates scheduling preconditions from already-fetched data. */
export function checkSchedulingPreconditions(opts: {
  jobStatus: string | null;
  activeVisitCount: number;
}): SchedulingGuardResult {
  if (!opts.jobStatus) return { ok: false, error: "JOB_NOT_FOUND" };
  if (opts.activeVisitCount > 0) return { ok: false, error: "ACTIVE_VISIT_EXISTS" };
  if (!["draft", "quoted", "scheduled"].includes(opts.jobStatus)) {
    return { ok: false, error: "JOB_NOT_SCHEDULABLE" };
  }
  return { ok: true };
}
