import { query } from "@/lib/db";
import type { TriageVisitRow } from "./triage";

const TRIAGE_VISIT_SELECT = `
  SELECT
    v.*,
    j.title AS job_title,
    u.full_name AS assigned_user_name,
    c.name AS client_name,
    p.address AS property_address
  FROM visits v
  LEFT JOIN jobs j ON j.id = v.job_id
  LEFT JOIN users u ON u.id = v.assigned_user_id
  LEFT JOIN clients c ON c.id = j.client_id
  LEFT JOIN properties p ON p.id = j.property_id`;

/**
 * Visits for an account, capped at 200, feeding the owner/admin triage on both
 * the Visits page and the Schedule "List" view.
 *
 * The cap is selection-ordered so it never hides current work: open visits
 * (scheduled / arrived / in_progress) come first, then the most recent terminal
 * ones for context. A plain `scheduled_start ASC LIMIT 200` would keep the 200
 * *oldest* rows, so a mature account with 200 old completed visits could drop
 * every current/overdue one — and the Today / Active / Overdue / Needs-assignment
 * buckets are all derived from these rows. The result is re-sorted ascending so
 * the triage sections still read earliest-first.
 */
export async function getTriageVisits(accountId: string): Promise<TriageVisitRow[]> {
  const rows = await query<TriageVisitRow>(
    `${TRIAGE_VISIT_SELECT}
     WHERE v.account_id = $1
     ORDER BY
       CASE WHEN v.status IN ('completed', 'cancelled') THEN 1 ELSE 0 END,
       CASE WHEN v.status IN ('completed', 'cancelled') THEN NULL ELSE v.scheduled_start END ASC NULLS LAST,
       v.scheduled_start DESC
     LIMIT 200`,
    [accountId]
  );
  return rows.sort(
    (a, b) =>
      new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime()
  );
}
