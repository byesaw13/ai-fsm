import { queryForSession } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth/session";
import { businessToday } from "@/lib/operations/business-day";

export type ArrivalProposalDto = {
  id: string;
  propertyId: string | null;
  propertyName: string;
  clientName: string;
  workOrderId: string | null;
  workOrderTitle: string | null;
  visitId: string | null;
  woResolution: string;
  confidenceScore: number;
  arrivalTime: string;
  departureTime: string | null;
  liveEligible: boolean;
};

export type OpenWoOption = {
  id: string;
  title: string;
  scheduledToday: boolean;
  propertyId: string;
};

export async function loadPendingArrivalProposals(
  session: SessionPayload,
): Promise<ArrivalProposalDto[]> {
  const today = businessToday();
  // Prefer candidates tied to this user's visits/WOs (multi-tech); still show
  // unassigned live-eligible stops so HA deep links work for solo accounts.
  return queryForSession<ArrivalProposalDto>(
    session,
    `SELECT vc.id,
            vc.property_id AS "propertyId",
            COALESCE(p.address, 'Property') AS "propertyName",
            COALESCE(c.name, 'Client') AS "clientName",
            vc.work_order_id AS "workOrderId",
            w.title AS "workOrderTitle",
            vc.visit_id AS "visitId",
            vc.wo_resolution AS "woResolution",
            vc.confidence_score AS "confidenceScore",
            vc.arrival_time::text AS "arrivalTime",
            vc.departure_time::text AS "departureTime",
            vc.live_eligible AS "liveEligible"
     FROM visit_candidates vc
     LEFT JOIN properties p ON p.id = vc.property_id
     LEFT JOIN clients c ON c.id = vc.matched_client_id
     LEFT JOIN work_orders w ON w.id = vc.work_order_id
     LEFT JOIN visits v ON v.id = vc.visit_id
     WHERE vc.account_id = $1 AND vc.status = 'pending'
       AND (vc.arrival_time AT TIME ZONE 'America/New_York')::date = $2::date
       AND (
         v.assigned_user_id = $3
         OR w.assigned_user_id = $3
         OR (vc.visit_id IS NULL AND vc.work_order_id IS NULL)
         OR vc.live_eligible = true
       )
     ORDER BY vc.live_eligible DESC, vc.arrival_time DESC
     LIMIT 10`,
    [session.accountId, today, session.userId],
  );
}

export async function loadOpenWorkOrdersForProperties(
  session: SessionPayload,
  propertyIds: string[],
): Promise<Record<string, OpenWoOption[]>> {
  if (propertyIds.length === 0) return {};
  const today = businessToday();
  const rows = await queryForSession<{
    property_id: string;
    id: string;
    title: string;
    scheduledToday: boolean;
  }>(
    session,
    `SELECT j.property_id::text AS property_id,
            w.id, w.title,
            EXISTS (
              SELECT 1 FROM visits v
              WHERE v.work_order_id = w.id AND v.status <> 'cancelled'
                AND (v.scheduled_start AT TIME ZONE 'America/New_York')::date = $2::date
            ) AS "scheduledToday"
     FROM work_orders w
     JOIN jobs j ON j.id = w.job_id
     WHERE w.account_id = $1
       AND j.property_id = ANY($3::uuid[])
       AND w.status IN ('draft','ready','scheduled','dispatched','waiting')
     ORDER BY w.created_at ASC`,
    [session.accountId, today, propertyIds],
  );
  const out: Record<string, OpenWoOption[]> = {};
  for (const r of rows) {
    const pid = r.property_id;
    const list = out[pid] ?? [];
    list.push({
      id: r.id,
      title: r.title,
      scheduledToday: r.scheduledToday,
      propertyId: pid,
    });
    out[pid] = list;
  }
  return out;
}
