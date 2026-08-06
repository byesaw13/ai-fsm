/**
 * TASK-067: load visit production timeline from visits + activity_entries.
 * Reference-only; no new storage.
 */
import {
  buildDayVisitTimelines,
  buildVisitTimeline,
  type VisitTimelineActivityInput,
  type VisitTimelineEvent,
  type VisitTimelineVisitInput,
} from "@ai-fsm/domain";
import { query } from "@/lib/db";
import { BUSINESS_TIMEZONE } from "@/lib/operations/business-day";

/** Postgres timezone literal for date bucketing (matches Day Review). */
const TZ = BUSINESS_TIMEZONE.includes("'") ? "America/New_York" : BUSINESS_TIMEZONE;

export type VisitTimelineCard = {
  visitId: string;
  propertyName: string;
  clientName: string;
  jobTitle: string | null;
  status: string;
  events: VisitTimelineEvent[];
};

type VisitRow = {
  id: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  arrived_at: string | null;
  completed_at: string | null;
  status: string;
  property_name: string;
  client_name: string;
  job_title: string | null;
};

type ActivityRow = {
  id: string;
  entity_id: string;
  activity_type: string;
  started_at: string;
  ended_at: string | null;
  note: string | null;
};

function toVisitInput(r: VisitRow): VisitTimelineVisitInput {
  return {
    id: r.id,
    scheduled_start: r.scheduled_start,
    scheduled_end: r.scheduled_end,
    arrived_at: r.arrived_at,
    completed_at: r.completed_at,
  };
}

function toActivityInput(r: ActivityRow): VisitTimelineActivityInput {
  return {
    id: r.id,
    activity_type: r.activity_type,
    started_at: r.started_at,
    ended_at: r.ended_at,
    label: r.note,
  };
}

async function loadActivitiesForVisitIds(
  accountId: string,
  visitIds: string[],
): Promise<Record<string, VisitTimelineActivityInput[]>> {
  const byVisit: Record<string, VisitTimelineActivityInput[]> = {};
  for (const id of visitIds) byVisit[id] = [];
  if (visitIds.length === 0) return byVisit;

  const rows = await query<ActivityRow>(
    `SELECT ae.id, ae.entity_id::text AS entity_id, ae.activity_type,
            ae.started_at::text AS started_at, ae.ended_at::text AS ended_at,
            ae.note
     FROM activity_entries ae
     WHERE ae.account_id = $1
       AND ae.entity_type = 'visit'
       AND ae.entity_id = ANY($2::uuid[])
       AND ae.voided_at IS NULL
     ORDER BY ae.started_at ASC`,
    [accountId, visitIds],
  );

  for (const r of rows) {
    const list = byVisit[r.entity_id];
    if (list) list.push(toActivityInput(r));
  }
  return byVisit;
}

/** Single visit production timeline. */
export async function loadVisitTimeline(
  accountId: string,
  visitId: string,
): Promise<VisitTimelineEvent[]> {
  const rows = await query<VisitRow>(
    `SELECT v.id, v.scheduled_start::text, v.scheduled_end::text,
            v.arrived_at::text, v.completed_at::text, v.status,
            COALESCE(p.address, 'Property') AS property_name,
            COALESCE(c.name, 'Client') AS client_name,
            j.title AS job_title
     FROM visits v
     JOIN jobs j ON j.id = v.job_id AND j.account_id = v.account_id
     LEFT JOIN properties p ON p.id = j.property_id AND p.account_id = v.account_id
     LEFT JOIN clients c ON c.id = j.client_id AND c.account_id = v.account_id
     WHERE v.account_id = $1 AND v.id = $2`,
    [accountId, visitId],
  );
  const visit = rows[0];
  if (!visit) return [];

  const activitiesByVisit = await loadActivitiesForVisitIds(accountId, [visitId]);
  return buildVisitTimeline({
    visit: toVisitInput(visit),
    activities: activitiesByVisit[visitId] ?? [],
  });
}

/**
 * Scheduled (and arrived/completed) visits for a business day with timelines.
 * Date rule: any of scheduled_start / arrived_at / completed_at on that date (business TZ).
 */
export async function loadDayVisitTimelines(
  accountId: string,
  businessDate: string,
): Promise<VisitTimelineCard[]> {
  const visitRows = await query<VisitRow>(
    `SELECT v.id, v.scheduled_start::text, v.scheduled_end::text,
            v.arrived_at::text, v.completed_at::text, v.status,
            COALESCE(p.address, 'Property') AS property_name,
            COALESCE(c.name, 'Client') AS client_name,
            j.title AS job_title
     FROM visits v
     JOIN jobs j ON j.id = v.job_id AND j.account_id = v.account_id
     LEFT JOIN properties p ON p.id = j.property_id AND p.account_id = v.account_id
     LEFT JOIN clients c ON c.id = j.client_id AND c.account_id = v.account_id
     WHERE v.account_id = $1
       AND v.status IS DISTINCT FROM 'cancelled'
       AND (
         (v.scheduled_start AT TIME ZONE '${TZ}')::date = $2::date
         OR (v.arrived_at AT TIME ZONE '${TZ}')::date = $2::date
         OR (v.completed_at AT TIME ZONE '${TZ}')::date = $2::date
       )
     ORDER BY COALESCE(v.arrived_at, v.scheduled_start) ASC NULLS LAST`,
    [accountId, businessDate],
  );

  const ids = visitRows.map((v) => v.id);
  const activitiesByVisit = await loadActivitiesForVisitIds(accountId, ids);
  const dayRows = buildDayVisitTimelines({
    visits: visitRows.map(toVisitInput),
    activitiesByVisitId: activitiesByVisit,
  });

  const eventsByVisit = new Map(dayRows.map((r) => [r.visitId, r.events]));

  return visitRows.map((v) => ({
    visitId: v.id,
    propertyName: v.property_name,
    clientName: v.client_name,
    jobTitle: v.job_title,
    status: v.status,
    events: eventsByVisit.get(v.id) ?? [],
  }));
}

/** Pure helper exported for unit tests of date-filter SQL params (not the SQL itself). */
export function groupActivitiesByVisitId(
  rows: ActivityRow[],
): Record<string, VisitTimelineActivityInput[]> {
  const out: Record<string, VisitTimelineActivityInput[]> = {};
  for (const r of rows) {
    if (!out[r.entity_id]) out[r.entity_id] = [];
    out[r.entity_id].push(toActivityInput(r));
  }
  return out;
}
