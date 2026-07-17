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
 * SQL fragment body that sums job_work minutes for a job.
 * Includes time linked to the job OR to any of its visits (multi-day T&M).
 * Params: $accountId, $jobId — callers bind positionally.
 */
export const TRACKED_LABOR_MINUTES_SQL = `
  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (ae.ended_at - ae.started_at)) / 60), 0)::numeric AS tracked_minutes
    FROM activity_entries ae
   WHERE ae.account_id = $1
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
     )
`;

/**
 * Tracked billable labor for a job — source of truth for:
 *   1) T&M invoice labor pull (customer rate × quarter hours)
 *   2) Job profit margin (internal cost rate × actual hours)
 *
 * Counts all closed job_work on the job itself or any of its visits.
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
