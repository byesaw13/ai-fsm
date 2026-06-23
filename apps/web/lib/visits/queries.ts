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
 * Every visit for an account, newest schedule first, capped at 200. Feeds the
 * owner/admin triage on both the Visits page and the Schedule "List" view.
 * Includes cancelled visits so the status-grouped sections stay complete.
 */
export function getTriageVisits(accountId: string) {
  return query<TriageVisitRow>(
    `${TRIAGE_VISIT_SELECT}
     WHERE v.account_id = $1
     ORDER BY v.scheduled_start ASC
     LIMIT 200`,
    [accountId]
  );
}
