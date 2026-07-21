import type { PoolClient } from "pg";
import {
  LABOR_COST_CENTS_PER_HOUR,
  LABOR_CUSTOMER_RATE_CENTS_PER_HOUR,
} from "@ai-fsm/domain";

/**
 * Tracked minutes → billable hours, rounded to the nearest quarter hour. The unit
 * in which labor is billed. Lives here (the labor-from-time module) and is
 * re-exported from line-items.ts for its existing importers.
 */
export function roundedQuarterHoursFromMinutes(minutes: number): number {
  if (minutes <= 0) return 0;
  return Math.round((minutes / 60) * 4) / 4;
}

/**
 * Actual (unrounded) hours from tracked minutes — used for profit margin display.
 */
export function trackedHoursFromMinutes(minutes: number): number {
  if (minutes <= 0) return 0;
  return Math.round((minutes / 60) * 100) / 100;
}

/**
 * Internal labor cost from tracked minutes × burdened cost rate.
 * Uses actual minutes (not quarter-hour rounding) so margin reflects real time.
 */
export function actualLaborCostCents(
  minutes: number,
  costRateCentsPerHour: number = LABOR_COST_CENTS_PER_HOUR,
): number {
  if (minutes <= 0) return 0;
  return Math.round((minutes / 60) * costRateCentsPerHour);
}

/**
 * Choose labor cost for margin: prefer tracked (actual) when any time is logged,
 * else fall back to estimate internal labor cost.
 */
export function laborCostForMargin(opts: {
  trackedMinutes: number;
  costRateCentsPerHour?: number;
  estimatedLaborCostCents: number | null;
}): {
  trackedMinutes: number;
  trackedHours: number;
  actualLaborCostCents: number | null;
  laborCostCents: number | null;
  source: "tracked" | "estimate" | "none";
} {
  const trackedMinutes = Math.max(0, opts.trackedMinutes);
  const rate = opts.costRateCentsPerHour ?? LABOR_COST_CENTS_PER_HOUR;
  const actual =
    trackedMinutes > 0 ? actualLaborCostCents(trackedMinutes, rate) : null;

  if (actual !== null) {
    return {
      trackedMinutes,
      trackedHours: trackedHoursFromMinutes(trackedMinutes),
      actualLaborCostCents: actual,
      laborCostCents: actual,
      source: "tracked",
    };
  }
  if (opts.estimatedLaborCostCents != null) {
    return {
      trackedMinutes: 0,
      trackedHours: 0,
      actualLaborCostCents: null,
      laborCostCents: opts.estimatedLaborCostCents,
      source: "estimate",
    };
  }
  return {
    trackedMinutes: 0,
    trackedHours: 0,
    actualLaborCostCents: null,
    laborCostCents: null,
    source: "none",
  };
}

/**
 * Shared WHERE for job-linked closed job_work rows.
 * Params: $1 accountId, $2 jobId.
 *
 * Includes:
 *   - job entity (unplanned / legacy)
 *   - visit entity (GPS confirm + field-day spine)
 *   - work_order entity (Daily Recap commits when no visit yet, or direct WO time)
 */
export const TRACKED_LABOR_JOB_WORK_WHERE = `
   ae.account_id = $1
   AND ae.activity_type = 'job_work'
   AND ae.voided_at IS NULL
   AND ae.started_at IS NOT NULL
   AND ae.ended_at IS NOT NULL
   AND (
     (ae.entity_type = 'job' AND ae.entity_id = $2)
     OR (
       ae.entity_type = 'visit'
       AND ae.entity_id IN (
         SELECT v.id FROM visits v
         WHERE v.job_id = $2 AND v.account_id = $1
       )
     )
     OR (
       ae.entity_type = 'work_order'
       AND ae.entity_id IN (
         SELECT wo.id FROM work_orders wo
         WHERE wo.job_id = $2 AND wo.account_id = $1
       )
     )
   )
`;

/**
 * SQL fragment body that sums job_work minutes for a job.
 * Includes time linked to the job, its visits, or its work orders.
 * Params: $accountId, $jobId — callers bind positionally.
 */
export const TRACKED_LABOR_MINUTES_SQL = `
  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (ae.ended_at - ae.started_at)) / 60), 0)::numeric AS tracked_minutes
    FROM activity_entries ae
   WHERE ${TRACKED_LABOR_JOB_WORK_WHERE}
`;

/**
 * One row per work day for transparent job-page display.
 * Groups by session_date (business day), with first start / last end and total minutes.
 * Params: $1 accountId, $2 jobId.
 */
export const TRACKED_LABOR_DAYS_SQL = `
  SELECT
    ae.session_date::text AS work_date,
    MIN(ae.started_at) AS started_at,
    MAX(ae.ended_at) AS ended_at,
    COALESCE(SUM(EXTRACT(EPOCH FROM (ae.ended_at - ae.started_at)) / 60), 0)::numeric AS minutes,
    COUNT(*)::int AS entry_count
  FROM activity_entries ae
  WHERE ${TRACKED_LABOR_JOB_WORK_WHERE}
  GROUP BY ae.session_date
  ORDER BY ae.session_date ASC
`;

export type TrackedLaborDay = {
  /** Business date YYYY-MM-DD (session_date) */
  work_date: string;
  started_at: string | Date;
  ended_at: string | Date;
  minutes: number;
  entry_count: number;
  hours: number;
};

/**
 * Format minutes as "6h 4m" / "45m" / "10h" for transparent day rows.
 */
export function formatMinutesAsHoursMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Map raw day rows (from TRACKED_LABOR_DAYS_SQL) into display-ready records.
 */
export function mapTrackedLaborDayRows(
  rows: Array<{
    work_date: string;
    started_at: string | Date;
    ended_at: string | Date;
    minutes: string | number;
    entry_count: string | number;
  }>,
): TrackedLaborDay[] {
  return rows.map((r) => {
    const minutes = Number(r.minutes ?? 0);
    return {
      work_date: r.work_date,
      started_at: r.started_at,
      ended_at: r.ended_at,
      minutes,
      entry_count: Number(r.entry_count ?? 0),
      hours: trackedHoursFromMinutes(minutes),
    };
  });
}

/**
 * Tracked billable labor for a job — source of truth for:
 *   1) T&M invoice labor pull (customer rate × quarter hours)
 *   2) Job profit margin (internal cost rate × actual hours)
 *
 * Counts all closed job_work on the job itself, its visits, or its work orders.
 * Deliberately NO labor_bucket filter.
 */
export async function trackedLaborMinutesFromActivityEntries(
  client: PoolClient,
  accountId: string,
  jobId: string,
): Promise<number> {
  const r = await client.query<{ tracked_minutes: string }>(
    TRACKED_LABOR_MINUTES_SQL,
    [accountId, jobId],
  );
  return Number(r.rows[0]?.tracked_minutes ?? 0);
}

/**
 * Day-by-day tracked job_work for a job (transparent hours record).
 */
export async function trackedLaborDaysFromActivityEntries(
  client: PoolClient,
  accountId: string,
  jobId: string,
): Promise<TrackedLaborDay[]> {
  const r = await client.query<{
    work_date: string;
    started_at: string | Date;
    ended_at: string | Date;
    minutes: string;
    entry_count: number;
  }>(TRACKED_LABOR_DAYS_SQL, [accountId, jobId]);
  return mapTrackedLaborDayRows(r.rows);
}

/**
 * Billable labor cents from tracked minutes — the shared transform BOTH invoice
 * readers apply (quarter-hour rounding × the customer labor rate).
 *
 * Pass account billing rate from business_pricing_settings when available.
 */
export function trackedLaborCents(
  minutes: number,
  billingRateCentsPerHour: number = LABOR_CUSTOMER_RATE_CENTS_PER_HOUR,
): number {
  return roundedQuarterHoursFromMinutes(minutes) * billingRateCentsPerHour;
}
