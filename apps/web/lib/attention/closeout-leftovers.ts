import type { SessionPayload } from "@/lib/auth/session";
import { queryForSession } from "@/lib/db";

export type CloseoutLeftoverCounts = {
  finishedUnbilled: number;
  openNoNextVisit: number;
  unlinkedReceiptsToday: number;
  untaggedClaimMiles: number;
};

export async function loadCloseoutLeftovers(
  session: SessionPayload,
): Promise<CloseoutLeftoverCounts> {
  const accountId = session.accountId;
  const [unbilled, noNext, receipts, untaggedMiles] = await Promise.all([
    queryForSession<{ count: string }>(
      session,
      `SELECT COUNT(*)::text AS count
       FROM jobs j
       WHERE j.account_id = $1
         AND (
           j.status = 'completed'
           OR EXISTS (
             SELECT 1 FROM visits v
             WHERE v.job_id = j.id AND v.account_id = j.account_id
               AND v.closeout_kind = 'done'
           )
         )
         AND NOT EXISTS (
           SELECT 1 FROM invoices i
           WHERE i.job_id = j.id AND i.account_id = j.account_id
             AND i.invoice_kind IN ('final', 'standard')
             AND i.status NOT IN ('cancelled', 'void')
         )`,
      [accountId],
    ),
    queryForSession<{ count: string }>(
      session,
      `SELECT COUNT(*)::text AS count
       FROM jobs j
       WHERE j.account_id = $1
         AND j.status = 'in_progress'
         AND EXISTS (
           SELECT 1 FROM visits v
           WHERE v.job_id = j.id AND v.account_id = j.account_id
             AND v.status = 'completed'
             AND v.visit_type IS DISTINCT FROM 'site_visit'
         )
         AND NOT EXISTS (
           SELECT 1 FROM visits v2
           WHERE v2.job_id = j.id AND v2.account_id = j.account_id
             AND v2.status = 'scheduled'
             AND v2.scheduled_start > NOW()
         )`,
      [accountId],
    ),
    queryForSession<{ count: string }>(
      session,
      `SELECT COUNT(*)::text AS count
       FROM expenses e
       WHERE e.account_id = $1
         AND e.job_id IS NULL
         AND e.reviewed_at IS NULL
         AND e.expense_date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/New_York')::date`,
      [accountId],
    ),
    queryForSession<{ count: string }>(
      session,
      `SELECT COUNT(*)::text AS count
       FROM vehicle_sessions s
       WHERE s.account_id = $1
         AND s.status = 'closed'
         AND s.session_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'America/New_York')::date - 14
         AND (s.miles_source IN ('odometer', 'manual_miles') OR s.miles_source IS NULL)
         AND NOT EXISTS (
           SELECT 1 FROM vehicle_session_activities a WHERE a.session_id = s.id
         )`,
      [accountId],
    ),
  ]);
  return {
    finishedUnbilled: parseInt(unbilled[0]?.count ?? "0", 10),
    openNoNextVisit: parseInt(noNext[0]?.count ?? "0", 10),
    unlinkedReceiptsToday: parseInt(receipts[0]?.count ?? "0", 10),
    untaggedClaimMiles: parseInt(untaggedMiles[0]?.count ?? "0", 10),
  };
}
