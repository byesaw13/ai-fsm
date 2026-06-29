import type { Visit, VisitStatus } from "@ai-fsm/domain";
import { isSameCalendarDay, isVisitOverdue } from "./p7";

/**
 * Row shape shared by every owner/admin visit-triage surface (the Visits page
 * and the Schedule "List" view). Mirrors the columns from getTriageVisits.
 */
export type TriageVisitRow = Visit & {
  job_title: string | null;
  assigned_user_name: string | null;
  client_name: string | null;
  property_address: string | null;
  sub_status: string | null;
};

export const VISIT_STATUS_LABELS: Record<VisitStatus, string> = {
  scheduled: "Scheduled",
  arrived: "Arrived",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const STATUS_ORDER: VisitStatus[] = [
  "in_progress",
  "arrived",
  "scheduled",
  "completed",
  "cancelled",
];

export interface VisitTriageData {
  metrics: {
    needsAssignment: number;
    today: number;
    activeNow: number;
    overdue: number;
  };
  overdue: TriageVisitRow[];
  unassigned: TriageVisitRow[];
  /** Visits grouped by status in STATUS_ORDER, overdue removed, empty groups dropped. */
  groups: { status: VisitStatus; visits: TriageVisitRow[] }[];
  total: number;
}

/**
 * Owner/admin triage view of a visit list: the metric counts, the overdue and
 * needs-assignment buckets, and the status-grouped remainder. Overdue visits
 * are surfaced in their own bucket and removed from the status groups so they
 * aren't listed twice. Pure — drives both the Visits page and Schedule's List
 * view from a single source of truth.
 */
export function buildVisitTriage(visits: TriageVisitRow[]): VisitTriageData {
  const today = visits.filter((v) => isSameCalendarDay(v.scheduled_start));
  // NB: wrap in an arrow — passing isVisitOverdue directly makes Array.filter
  // hand it the element index as its `nowMs` arg, which silently emptied the
  // overdue bucket (the bug this extraction inherited from the old Visits page).
  const overdue = visits.filter((v) => isVisitOverdue(v));
  const unassigned = visits.filter(
    (v) =>
      !v.assigned_user_id &&
      v.status !== "completed" &&
      v.status !== "cancelled"
  );
  const activeNow = visits.filter(
    (v) => v.status === "in_progress" || v.status === "arrived"
  );

  const overdueIds = new Set(overdue.map((v) => v.id));
  const groups = STATUS_ORDER.map((status) => ({
    status,
    visits: visits.filter((v) => v.status === status && !overdueIds.has(v.id)),
  })).filter((g) => g.visits.length > 0);

  return {
    metrics: {
      needsAssignment: unassigned.length,
      today: today.length,
      activeNow: activeNow.length,
      overdue: overdue.length,
    },
    overdue,
    unassigned,
    groups,
    total: visits.length,
  };
}
