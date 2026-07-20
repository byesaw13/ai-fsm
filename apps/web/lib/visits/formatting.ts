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

export function isVisitOverdue(
  visit: VisitLikeForUi,
  nowMs = Date.now()
): boolean {
  if (visit.status === "scheduled" || visit.status === "arrived") {
    return new Date(visit.scheduled_start).getTime() < nowMs;
  }
  if (visit.status === "in_progress") {
    const endTime = visit.scheduled_end
      ? new Date(visit.scheduled_end).getTime()
      : new Date(visit.scheduled_start).getTime() + 4 * 60 * 60 * 1000;
    return endTime < nowMs;
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

