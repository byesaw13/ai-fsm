import type { PoolClient } from "pg";
import type { OpenWorkOrderOption } from "@ai-fsm/domain";

/**
 * Bookable / open work orders at a property for arrival-proposal resolution.
 * Includes today's visit when one exists on that WO.
 */
export async function listOpenWorkOrdersAtProperty(
  client: PoolClient,
  accountId: string,
  propertyId: string,
  atIso: string,
): Promise<OpenWorkOrderOption[]> {
  const { rows } = await client.query<{
    id: string;
    title: string;
    status: string;
    visit_id: string | null;
    scheduled_today: boolean;
  }>(
    `SELECT w.id, w.title, w.status,
            tv.id AS visit_id,
            (tv.id IS NOT NULL) AS scheduled_today
     FROM work_orders w
     JOIN jobs j ON j.id = w.job_id
     LEFT JOIN LATERAL (
       SELECT v.id FROM visits v
       WHERE v.work_order_id = w.id AND v.status <> 'cancelled'
         AND (v.scheduled_start AT TIME ZONE 'America/New_York')::date
             = ($3::timestamptz AT TIME ZONE 'America/New_York')::date
       ORDER BY v.scheduled_start ASC
       LIMIT 1
     ) tv ON true
     WHERE j.property_id = $1 AND w.account_id = $2
       AND w.status IN ('draft','ready','scheduled','dispatched','waiting')
     ORDER BY w.created_at ASC`,
    [propertyId, accountId, atIso],
  );
  return rows.map((w) => ({
    id: w.id,
    title: w.title,
    status: w.status,
    scheduledToday: w.scheduled_today,
    visitId: w.visit_id,
  }));
}
