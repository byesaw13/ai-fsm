import type { VisitStatus } from "@ai-fsm/domain";
import { BUSINESS_TIMEZONE } from "@/lib/operations/business-day";

export interface VisitLikeForUi {
  scheduled_start: string;
  scheduled_end?: string | null;
  status: VisitStatus | string;
}

/**
 * Format clock time in the business timezone. Pages are often server-rendered
 * inside a UTC container; without an explicit timeZone, Eastern times show 4h off (EDT).
 */
export function formatVisitTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: BUSINESS_TIMEZONE,
  });
}

export function formatVisitDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: BUSINESS_TIMEZONE,
  });
  return `${date} ${formatVisitTime(iso)}`;
}

export function formatVisitDateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: BUSINESS_TIMEZONE,
  });
}

/** YYYY-MM-DD in the business timezone (for day-boundary comparisons). */
function businessCalendarDate(isoOrMs: string | number): string {
  return new Date(isoOrMs).toLocaleDateString("en-CA", {
    timeZone: BUSINESS_TIMEZONE,
  });
}

/**
 * How long past scheduled_end an in-progress visit may run before we call it
 * overdue (finishing a job a bit late is normal).
 */
export const IN_PROGRESS_OVERDUE_GRACE_MS = 2 * 60 * 60 * 1000; // 2 hours

/**
 * Whether a visit needs attention as *overdue* (reschedule / forgotten).
 *
 * Being a little late on the scheduled day does **not** count — field work
 * often starts after the nominal start time. We only flag scheduled/arrived
 * visits once their **business calendar day** is fully in the past.
 *
 * In-progress visits use scheduled_end (+ 2h grace) so a long day isn't
 * "overdue" the moment the window ends.
 */
export function isVisitOverdue(
  visit: VisitLikeForUi,
  nowMs = Date.now()
): boolean {
  if (visit.status === "scheduled" || visit.status === "arrived") {
    // Same day (or future day): not overdue for reschedule — just start the visit.
    return businessCalendarDate(visit.scheduled_start) < businessCalendarDate(nowMs);
  }
  if (visit.status === "in_progress") {
    const endTime = visit.scheduled_end
      ? new Date(visit.scheduled_end).getTime()
      : new Date(visit.scheduled_start).getTime() + 8 * 60 * 60 * 1000;
    return endTime + IN_PROGRESS_OVERDUE_GRACE_MS < nowMs;
  }
  return false;
}

export function isSameCalendarDay(iso: string, ref = new Date()): boolean {
  const d = new Date(iso);
  return (
    d.getDate() === ref.getDate() &&
    d.getMonth() === ref.getMonth() &&
    d.getFullYear() === ref.getFullYear()
  );
}

export function formatOverdueLabel(iso: string, nowMs = Date.now()): string {
  const diffMs = nowMs - new Date(iso).getTime();
  const diffMins = Math.max(0, Math.round(diffMs / 60000));
  if (diffMins >= 60) return `${Math.round(diffMins / 60)}h overdue`;
  return `${diffMins}m overdue`;
}

