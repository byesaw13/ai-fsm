/**
 * Visit production timeline helpers (TASK-067).
 * Pure assembly of lifecycle + activity_entries into ordered events.
 * No storage — reference-only over existing ledgers.
 */

import { ACTIVITY_TYPE_META, type ActivityType } from "./activities";

export const VISIT_TIMELINE_KINDS = [
  "scheduled",
  "arrived",
  "activity",
  "completed",
] as const;

export type VisitTimelineKind = (typeof VISIT_TIMELINE_KINDS)[number];

/** Tie-break when `at` is equal: scheduled → arrived → activity → completed */
const KIND_RANK: Record<VisitTimelineKind, number> = {
  scheduled: 0,
  arrived: 1,
  activity: 2,
  completed: 3,
};

export type VisitTimelineSource = {
  table: "visits" | "activity_entries";
  id: string;
};

export type VisitTimelineEvent = {
  id: string;
  kind: VisitTimelineKind;
  at: string;
  ended_at: string | null;
  title: string;
  subtitle: string | null;
  source: VisitTimelineSource;
  /** True when activity has no ended_at */
  is_open: boolean;
};

export type VisitTimelineVisitInput = {
  id: string;
  scheduled_start: string | null;
  scheduled_end?: string | null;
  arrived_at: string | null;
  completed_at: string | null;
};

export type VisitTimelineActivityInput = {
  id: string;
  activity_type: string;
  started_at: string;
  ended_at: string | null;
  /** Pre-voided rows should be filtered by the loader; still ignored if present */
  voided_at?: string | null;
  label?: string | null;
};

function activityTitle(activityType: string, label?: string | null): string {
  if (label?.trim()) return label.trim();
  const meta = ACTIVITY_TYPE_META[activityType as ActivityType];
  return meta?.label ?? activityType;
}

function formatRange(startIso: string, endIso: string | null): string {
  try {
    const start = new Date(startIso);
    const startLabel = start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (!endIso) return `${startLabel}–`;
    const end = new Date(endIso);
    const endLabel = end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return `${startLabel}–${endLabel}`;
  } catch {
    return endIso ? `${startIso}–${endIso}` : `${startIso}–`;
  }
}

/** Pure: lifecycle + activities → sorted timeline events for one visit. */
export function buildVisitTimeline(input: {
  visit: VisitTimelineVisitInput;
  activities: VisitTimelineActivityInput[];
}): VisitTimelineEvent[] {
  const events: VisitTimelineEvent[] = [];
  const { visit, activities } = input;

  if (visit.scheduled_start) {
    const end = visit.scheduled_end ?? null;
    events.push({
      id: `scheduled:${visit.id}`,
      kind: "scheduled",
      at: visit.scheduled_start,
      ended_at: end,
      title: "Scheduled",
      subtitle: end ? formatRange(visit.scheduled_start, end) : null,
      source: { table: "visits", id: visit.id },
      is_open: false,
    });
  }

  if (visit.arrived_at) {
    events.push({
      id: `arrived:${visit.id}`,
      kind: "arrived",
      at: visit.arrived_at,
      ended_at: null,
      title: "Arrived on site",
      subtitle: null,
      source: { table: "visits", id: visit.id },
      is_open: false,
    });
  }

  for (const a of activities) {
    if (a.voided_at) continue;
    if (!a.started_at) continue;
    const isOpen = a.ended_at == null;
    events.push({
      id: `activity:${a.id}`,
      kind: "activity",
      at: a.started_at,
      ended_at: a.ended_at,
      title: activityTitle(a.activity_type, a.label),
      subtitle: formatRange(a.started_at, a.ended_at),
      source: { table: "activity_entries", id: a.id },
      is_open: isOpen,
    });
  }

  if (visit.completed_at) {
    events.push({
      id: `completed:${visit.id}`,
      kind: "completed",
      at: visit.completed_at,
      ended_at: null,
      title: "Visit completed",
      subtitle: null,
      source: { table: "visits", id: visit.id },
      is_open: false,
    });
  }

  return events.sort((a, b) => {
    const ta = Date.parse(a.at);
    const tb = Date.parse(b.at);
    if (ta !== tb) return ta - tb;
    const kr = KIND_RANK[a.kind] - KIND_RANK[b.kind];
    if (kr !== 0) return kr;
    return a.id.localeCompare(b.id);
  });
}

export type DayVisitTimelineRow = {
  visitId: string;
  events: VisitTimelineEvent[];
};

/** Pure: one timeline per visit, order preserved from visits input. */
export function buildDayVisitTimelines(input: {
  visits: VisitTimelineVisitInput[];
  activitiesByVisitId: Record<string, VisitTimelineActivityInput[]>;
}): DayVisitTimelineRow[] {
  return input.visits.map((visit) => ({
    visitId: visit.id,
    events: buildVisitTimeline({
      visit,
      activities: input.activitiesByVisitId[visit.id] ?? [],
    }),
  }));
}
