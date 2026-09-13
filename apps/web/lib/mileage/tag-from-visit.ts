import type { PoolClient } from "pg";
import {
  isClaimMilesSource,
  isGpsEstimateSource,
  mileageTagStrategy,
  type MilesSource,
} from "@ai-fsm/domain";

const PAD_MS = 30 * 60 * 1000;

export async function tagMileageForCompletedVisit(
  client: PoolClient,
  opts: {
    accountId: string;
    jobId: string;
    visitId: string;
    day: string;
    windowStart: Date;
    windowEnd: Date;
  },
): Promise<{ strategy: string; tagged: number }> {
  const others = await client.query<{ count: string }>(
    `SELECT COUNT(DISTINCT v.job_id)::text AS count
     FROM visits v
     WHERE v.account_id = $1
       AND v.id <> $2
       AND v.job_id IS NOT NULL
       AND v.job_id IS DISTINCT FROM $3
       AND v.status NOT IN ('cancelled')
       AND v.visit_type IN ('standard', 'punch_list')
       AND timezone('America/New_York', COALESCE(v.completed_at, v.scheduled_start))::date = $4::date`,
    [opts.accountId, opts.visitId, opts.jobId, opts.day],
  );
  const otherCount = parseInt(others.rows[0]?.count ?? "0", 10);

  const sessions = await client.query<{
    id: string;
    miles_source: MilesSource | null;
    started_at: string | null;
    ended_at: string | null;
    tagged: boolean;
  }>(
    `SELECT s.id, s.miles_source, s.started_at::text, s.ended_at::text,
            EXISTS (SELECT 1 FROM vehicle_session_activities a WHERE a.session_id = s.id) AS tagged
     FROM vehicle_sessions s
     WHERE s.account_id = $1
       AND s.session_date = $2::date
       AND s.status IS DISTINCT FROM 'voided'`,
    [opts.accountId, opts.day],
  );

  const hasUntaggedClaim = sessions.rows.some(
    (r) => !r.tagged && isClaimMilesSource(r.miles_source),
  );
  const hasUntaggedGpsHops = sessions.rows.some(
    (r) => !r.tagged && isGpsEstimateSource(r.miles_source),
  );
  const strategy = mileageTagStrategy({
    otherCompletedVisitsThatDay: otherCount,
    hasUntaggedClaim,
    hasUntaggedGpsHops,
  });
  if (strategy === "none") return { strategy, tagged: 0 };

  const padStart = new Date(opts.windowStart.getTime() - PAD_MS);
  const padEnd = new Date(opts.windowEnd.getTime() + PAD_MS);

  const toTag = sessions.rows.filter((r) => {
    if (r.tagged) return false;
    if (strategy === "claim_day") return isClaimMilesSource(r.miles_source);
    if (!isGpsEstimateSource(r.miles_source) || !r.started_at || !r.ended_at) return false;
    const a = new Date(r.started_at).getTime();
    const b = new Date(r.ended_at).getTime();
    return a < padEnd.getTime() && b > padStart.getTime();
  });

  let tagged = 0;
  for (const row of toTag) {
    await client.query(
      `INSERT INTO vehicle_session_activities (session_id, entity_type, entity_id)
       SELECT $1, 'job', $2
       WHERE NOT EXISTS (
         SELECT 1 FROM vehicle_session_activities
         WHERE session_id = $1 AND entity_type = 'job' AND entity_id = $2
       )`,
      [row.id, opts.jobId],
    );
    tagged += 1;
  }
  return { strategy, tagged };
}
