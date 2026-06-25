// Payroll clock taxonomy + pure helpers (TASK-052, Operations Engine Phase 2).
//
// The payroll clock answers "was this person working?" — independent of the
// activity timeline ("what were they doing?"). All pay types share the one clock;
// only the downstream calculation differs. Canonical: docs/canonical/OPERATIONS.md.

export const PAY_TYPES = [
  "hourly",
  "salary",
  "piecework",
  "subcontractor",
  "owner_draw",
] as const;

export type PayType = (typeof PAY_TYPES)[number];

export const PAY_TYPE_LABELS: Record<PayType, string> = {
  hourly: "Hourly",
  salary: "Salary",
  piecework: "Piecework",
  subcontractor: "Subcontractor",
  owner_draw: "Owner draw",
};

export const TIME_CLOCK_STATUSES = ["open", "closed"] as const;
export type TimeClockStatus = (typeof TIME_CLOCK_STATUSES)[number];

export function isClockOpen(status: TimeClockStatus): boolean {
  return status === "open";
}

/**
 * Worked minutes for a clock session. Pure: an open session (no clock-out) is
 * measured to `now`. Never negative. Break deductions are a Payroll-Policy
 * concern applied downstream — this is raw elapsed time only.
 */
export function clockDurationMinutes(
  clockInAt: Date | string,
  clockOutAt: Date | string | null,
  now: Date = new Date(),
): number {
  const start = new Date(clockInAt).getTime();
  const end = clockOutAt ? new Date(clockOutAt).getTime() : now.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.round((end - start) / 60000));
}
