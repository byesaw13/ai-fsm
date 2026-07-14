import type { PoolClient } from "pg";
import { LABOR_CUSTOMER_RATE_CENTS_PER_HOUR } from "@ai-fsm/domain";

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
 * Tracked billable labor for a job — the source of truth behind invoice labor
 * (Time Truth Consolidation, EPIC-001).
 *
 * Time lives in activity_entries via the visit linkage. activity_entries attaches
 * to the visit (entity_type='visit'); the job is recovered by joining visits.
 * Scoped to job_work segments, this reproduced exactly what the legacy per-visit
 * timer (visit_time_logs) summed — proven cent-for-cent by the TASK-062 parity gate
 * before the swap (TASK-063), after which the timer table was retired (TASK-065).
 *
 * Deliberately NO labor_bucket filter: it would change the result versus the
 * job_work set the readers have always billed.
 */
export async function trackedLaborMinutesFromActivityEntries(
  client: PoolClient,
  accountId: string,
  jobId: string,
): Promise<number> {
  const r = await client.query<{ tracked_minutes: string }>(
    `SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (ae.ended_at - ae.started_at)) / 60), 0)::numeric AS tracked_minutes
       FROM activity_entries ae
       JOIN visits v ON v.id = ae.entity_id AND ae.entity_type = 'visit'
      WHERE ae.account_id = $1
        AND v.job_id = $2
        AND ae.activity_type = 'job_work'
        AND ae.voided_at IS NULL
        AND ae.started_at IS NOT NULL
        AND ae.ended_at IS NOT NULL`,
    [accountId, jobId],
  );
  return Number(r.rows[0]?.tracked_minutes ?? 0);
}

/**
 * Billable labor cents from tracked minutes — the shared transform BOTH invoice
 * readers apply (quarter-hour rounding × the customer labor rate). Parity at the
 * minute level therefore guarantees parity at the billed-cents level for both
 * the final-invoice path and the manual "pull labor from tracked time" path.
 *
 * Pass account billing rate from business_pricing_settings when available.
 */
export function trackedLaborCents(
  minutes: number,
  billingRateCentsPerHour: number = LABOR_CUSTOMER_RATE_CENTS_PER_HOUR
): number {
  return roundedQuarterHoursFromMinutes(minutes) * billingRateCentsPerHour;
}
