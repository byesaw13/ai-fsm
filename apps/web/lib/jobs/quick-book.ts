/** Field home after a My Day / FAB quick-job capture (TASK-119). */
export const QUICK_JOB_SUCCESS_HREF = "/app/my-work";

/**
 * Quick-booked visits only show on My Day when assigned to the viewer.
 * If the form omits a tech, assign the person who booked it.
 */
export function resolveQuickBookAssignee(
  requested: string | undefined,
  sessionUserId: string,
): string {
  const trimmed = requested?.trim();
  return trimmed ? trimmed : sessionUserId;
}

/** Local calendar date + HH:mm, rounded up to the next half hour ("Now"). */
export function nextHalfHourLocal(now = new Date()): { date: string; time: string } {
  const rounded = new Date(now);
  rounded.setSeconds(0, 0);
  const minutes = rounded.getMinutes();
  if (minutes === 0) {
    rounded.setMinutes(30);
  } else if (minutes < 30) {
    rounded.setMinutes(30);
  } else {
    rounded.setMinutes(0);
    rounded.setHours(rounded.getHours() + 1);
  }
  const y = rounded.getFullYear();
  const m = String(rounded.getMonth() + 1).padStart(2, "0");
  const d = String(rounded.getDate()).padStart(2, "0");
  const hh = String(rounded.getHours()).padStart(2, "0");
  const mm = String(rounded.getMinutes()).padStart(2, "0");
  return { date: `${y}-${m}-${d}`, time: `${hh}:${mm}` };
}
