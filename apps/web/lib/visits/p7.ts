import type { VisitStatus } from "@ai-fsm/domain";

export interface VisitLikeForUi {
  scheduled_start: string;
  status: VisitStatus | string;
}

export function formatVisitTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatVisitDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString()} ${formatVisitTime(iso)}`;
}

export function formatVisitDateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function isVisitOverdue(
  visit: VisitLikeForUi,
  nowMs = Date.now()
): boolean {
  const scheduledTime = new Date(visit.scheduled_start).getTime();
  return (
    scheduledTime < nowMs &&
    (visit.status === "scheduled" || visit.status === "arrived")
  );
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

