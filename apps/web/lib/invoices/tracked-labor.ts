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
 * Tracked billable labor for a job — the source-of-truth helpers behind invoice
 * labor (Time Truth Consolidation, EPIC-001).
 *
 * Two implementations sum the SAME tracked time two ways. TASK-062 proves they
 * are equal (cent-for-cent) on real data; TASK-063 then swaps the invoice readers
 * from the visit_time_logs version to the activity_entries version. They live
 * here, side by side, so the parity test and the eventual swap share one query.
 */

/**
 * LEGACY source: the per-visit timer table. This is exactly the query the two
 * invoice-labor readers run today (final-invoice.ts fallback and
 * line-items.ts upsertLaborLineFromTrackedTime), kept here verbatim as the parity
 * reference. The readers still inline it until TASK-063.
 */
export async function trackedLaborMinutesFromVisitTimeLogs(
  client: PoolClient,
  accountId: string,
  jobId: string,
): Promise<number> {
  const r = await client.query<{ tracked_minutes: string }>(
    `SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (ended_at - started_at)) / 60), 0)::numeric AS tracked_minutes
       FROM visit_time_logs
      WHERE account_id = $1
        AND job_id = $2
        AND started_at IS NOT NULL
        AND ended_at IS NOT NULL`,
    [accountId, jobId],
  );
  return Number(r.rows[0]?.tracked_minutes ?? 0);
}

/**
 * NEW source: the time truth (activity_entries) via the visit linkage.
 * activity_entries attaches to the visit (entity_type='visit'); the job is
 * recovered by joining visits. Scoped to job_work segments so it reproduces
 * exactly the visit-timer set — the transition route's dual-write plus the
 * TASK-061 backfill make the two 1:1.
 *
 * Deliberately NO labor_bucket filter: visit_time_logs has no bucket concept, so
 * matching it (rather than filtering) is what preserves parity. The parity
 * contract (TASK-062) wins over filter elegance.
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
 */
export function trackedLaborCents(minutes: number): number {
  return roundedQuarterHoursFromMinutes(minutes) * LABOR_CUSTOMER_RATE_CENTS_PER_HOUR;
}
