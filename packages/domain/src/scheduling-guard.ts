export type SchedulingGuardError =
  | "JOB_NOT_FOUND"
  | "ESTIMATE_NOT_APPROVED"
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
  if (!["quoted", "scheduled", "in_progress", "completed", "invoiced"].includes(opts.jobStatus)) {
    return { ok: false, error: "ESTIMATE_NOT_APPROVED" };
  }
  if (opts.activeVisitCount > 0) return { ok: false, error: "ACTIVE_VISIT_EXISTS" };
  return { ok: true };
}
