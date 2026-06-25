// Business Day state machine (TASK-051, Operations Engine Phase 1).
//
// The Business Day is a pure AGGREGATE that summarizes today's operational
// records and owns nothing. This module is the day's own lifecycle — and, just
// as importantly, it encodes the rule that closing any *other* concern (a trip,
// an activity, a job, returning home) NEVER transitions the day. Only explicit
// day-level actions move the day; everything else leaves it untouched.
//
// Canonical design: docs/canonical/OPERATIONS.md.

export const BUSINESS_DAY_STATUSES = [
  "OPEN",
  "ACTIVE",
  "PAUSED",
  "READY_TO_CLOSE",
  "CLOSED",
  "REOPENED",
] as const;

export type BusinessDayStatus = (typeof BUSINESS_DAY_STATUSES)[number];

// Allowed explicit day transitions. CLOSED is only reachable via
// READY_TO_CLOSE, so the Day Close checklist (TASK-054) always runs. REOPENED is
// a normal action from CLOSED and behaves like an active day thereafter.
export const BUSINESS_DAY_TRANSITIONS: Record<BusinessDayStatus, readonly BusinessDayStatus[]> = {
  OPEN:           ["ACTIVE", "PAUSED", "READY_TO_CLOSE"],
  ACTIVE:         ["PAUSED", "READY_TO_CLOSE"],
  PAUSED:         ["ACTIVE", "READY_TO_CLOSE"],
  READY_TO_CLOSE: ["ACTIVE", "PAUSED", "CLOSED"],
  CLOSED:         ["REOPENED"],
  REOPENED:       ["ACTIVE", "PAUSED", "READY_TO_CLOSE"],
};

/** Is the day still open for business? True for every non-CLOSED status. */
export function isBusinessDayOpen(status: BusinessDayStatus): boolean {
  return status !== "CLOSED";
}

/** Is the day in an actively-working state (not paused, not closed/ready)? */
export function isBusinessDayActive(status: BusinessDayStatus): boolean {
  return status === "ACTIVE" || status === "OPEN" || status === "REOPENED";
}

export function canTransitionBusinessDay(
  from: BusinessDayStatus,
  to: BusinessDayStatus
): boolean {
  return BUSINESS_DAY_TRANSITIONS[from].includes(to);
}

/** Reopening is the only transition that must carry a reason. */
export function businessDayTransitionNeedsReason(to: BusinessDayStatus): boolean {
  return to === "REOPENED";
}

export interface BusinessDayTransitionCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Validate an explicit day transition, including the reason requirement for
 * reopening. Pure — callers (API routes) surface `reason` to the client.
 */
export function checkBusinessDayTransition(
  from: BusinessDayStatus,
  to: BusinessDayStatus,
  opts: { reason?: string } = {}
): BusinessDayTransitionCheck {
  if (!canTransitionBusinessDay(from, to)) {
    return { ok: false, reason: `Cannot move a business day from ${from} to ${to}.` };
  }
  if (businessDayTransitionNeedsReason(to) && !(opts.reason ?? "").trim()) {
    return { ok: false, reason: "Reopening a day requires a reason." };
  }
  return { ok: true };
}

/**
 * The load-bearing invariant: closing a sub-concern (trip / activity / job /
 * returning home) does NOT change the day's status. This identity function
 * exists so that invariant is explicit and unit-tested, and so call sites that
 * close other concerns route through it rather than ever mutating the day.
 */
export function businessDayStatusAfterConcernClosed(
  status: BusinessDayStatus
): BusinessDayStatus {
  return status;
}
