import type { PoolClient } from "pg";
import {
  matchCustomerAtStop,
  type ConfirmedStopMatch,
  type PropertyGeo,
} from "@/lib/field/stop-proximity";

export type SiteContextSource = "location" | "activity";

export interface LikelySiteCustomer {
  clientId: string;
  clientName: string;
  propertyId: string | null;
  propertyAddress: string | null;
  jobId: string | null;
  visitId: string | null;
  source: SiteContextSource;
  confidence: number;
  reason: string;
  distanceMeters?: number;
}

export interface LinkedTravelSegment {
  segmentId: string;
  durationMinutes: number;
  placeLabel: string | null;
}

export interface ActiveSiteSession {
  activityEntryId: string;
  activityType: string;
  startedAt: string;
  clientName: string | null;
  propertyAddress: string | null;
  entityType: string | null;
  entityId: string | null;
}

export interface FieldSiteContext {
  likely: LikelySiteCustomer | null;
  activeSiteSession: ActiveSiteSession | null;
  /** Open GPS stop duration — only meaningful when auto-detect is evaluating. */
  openStopMinutes: number | null;
  /** Set when auto-detect confirmed stop ↔ address proximity. */
  confirmedStop: {
    stopSegmentId: string;
    distanceMeters: number;
    travelBefore: LinkedTravelSegment | null;
    travelAfter: LinkedTravelSegment | null;
  } | null;
}

const SITE_ACTIVITY_TYPES = new Set(["job_work", "estimate_visit", "follow_up", "warranty_callback"]);

function likelyFromMatch(match: ConfirmedStopMatch): LikelySiteCustomer {
  return {
    clientId: match.clientId,
    clientName: match.clientName,
    propertyId: match.propertyId,
    propertyAddress: match.propertyAddress,
    jobId: match.jobId,
    visitId: match.visitId,
    source: "location",
    confidence: match.confidence,
    reason: match.reason,
    distanceMeters: match.distanceMeters,
  };
}

async function loadTravelAroundStop(
  client: PoolClient,
  accountId: string,
  stopSegmentId: string,
  stopStartedAt: string,
  stopEndedAt: string | null,
): Promise<{
  travelBefore: LinkedTravelSegment | null;
  travelAfter: LinkedTravelSegment | null;
}> {
  const before = await client.query<{
    id: string;
    duration_min: string;
    place_label: string | null;
  }>(
    `SELECT id, EXTRACT(EPOCH FROM (ended_at - started_at)) / 60 AS duration_min, place_label
     FROM location_segments
     WHERE account_id = $1 AND kind = 'drive' AND ended_at IS NOT NULL
       AND ended_at <= $2::timestamptz
       AND segment_date = ($2::timestamptz)::date
     ORDER BY ended_at DESC
     LIMIT 1`,
    [accountId, stopStartedAt],
  );

  let travelAfter: LinkedTravelSegment | null = null;
  if (stopEndedAt) {
    const after = await client.query<{
      id: string;
      duration_min: string;
      place_label: string | null;
    }>(
      `SELECT id, EXTRACT(EPOCH FROM (ended_at - started_at)) / 60 AS duration_min, place_label
       FROM location_segments
       WHERE account_id = $1 AND kind = 'drive' AND started_at >= $2::timestamptz
         AND segment_date = ($2::timestamptz)::date
       ORDER BY started_at ASC
       LIMIT 1`,
      [accountId, stopEndedAt],
    );
    if (after.rows[0]) {
      travelAfter = {
        segmentId: after.rows[0].id,
        durationMinutes: Math.max(1, Math.round(parseFloat(after.rows[0].duration_min))),
        placeLabel: after.rows[0].place_label,
      };
    }
  }

  const travelBefore = before.rows[0]
    ? {
        segmentId: before.rows[0].id,
        durationMinutes: Math.max(1, Math.round(parseFloat(before.rows[0].duration_min))),
        placeLabel: before.rows[0].place_label,
      }
    : null;

  return { travelBefore, travelAfter };
}

async function resolveConfirmedStopMatch(
  client: PoolClient,
  accountId: string,
  openStop: {
    id: string;
    latitude: number;
    longitude: number;
    started_at: string;
    openStopMinutes: number;
  },
): Promise<{
  likely: LikelySiteCustomer;
  confirmedStop: NonNullable<FieldSiteContext["confirmedStop"]>;
} | null> {
  const props = await client.query<{
    property_id: string;
    client_id: string;
    client_name: string;
    address: string;
    latitude: number;
    longitude: number;
    geofence_radius_feet: number;
    scheduled_today: boolean;
    visit_id: string | null;
    job_id: string | null;
  }>(
    `SELECT p.id AS property_id, p.client_id, c.name AS client_name, p.address,
            p.latitude, p.longitude, p.geofence_radius_feet,
            EXISTS (
              SELECT 1 FROM visits v
              JOIN jobs j2 ON j2.id = v.job_id
              WHERE j2.property_id = p.id AND v.account_id = p.account_id
                AND v.scheduled_start::date = CURRENT_DATE
                AND v.status NOT IN ('completed', 'cancelled')
            ) AS scheduled_today,
            (
              SELECT v.id FROM visits v
              JOIN jobs j2 ON j2.id = v.job_id
              WHERE j2.property_id = p.id AND v.account_id = p.account_id
                AND v.scheduled_start::date = CURRENT_DATE
                AND v.status NOT IN ('completed', 'cancelled')
              ORDER BY v.scheduled_start ASC LIMIT 1
            ) AS visit_id,
            (
              SELECT j3.id FROM jobs j3
              WHERE j3.property_id = p.id AND j3.account_id = p.account_id
                AND j3.status IN ('scheduled', 'in_progress')
              ORDER BY j3.updated_at DESC LIMIT 1
            ) AS job_id
     FROM properties p
     JOIN clients c ON c.id = p.client_id
     WHERE p.account_id = $1 AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL`,
    [accountId],
  );

  const propertyList: PropertyGeo[] = props.rows.map((row) => ({
    propertyId: row.property_id,
    clientId: row.client_id,
    clientName: row.client_name,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    geofenceRadiusFeet: row.geofence_radius_feet,
    scheduledToday: row.scheduled_today,
    jobId: row.job_id,
    visitId: row.visit_id,
  }));

  const match = matchCustomerAtStop(
    { latitude: openStop.latitude, longitude: openStop.longitude },
    openStop.openStopMinutes,
    propertyList,
  );

  if (!match) return null;

  const travel = await loadTravelAroundStop(
    client,
    accountId,
    openStop.id,
    openStop.started_at,
    null,
  );

  return {
    likely: likelyFromMatch(match),
    confirmedStop: {
      stopSegmentId: openStop.id,
      distanceMeters: match.distanceMeters,
      travelBefore: travel.travelBefore,
      travelAfter: travel.travelAfter,
    },
  };
}

export async function loadFieldSiteContext(
  client: PoolClient,
  accountId: string,
  userId: string,
): Promise<FieldSiteContext> {
  const activeSite = await client.query<{
    id: string;
    activity_type: string;
    started_at: string;
    entity_type: string | null;
    entity_id: string | null;
    client_id: string | null;
    client_name: string | null;
    property_id: string | null;
    property_address: string | null;
  }>(
    `SELECT ae.id, ae.activity_type, ae.started_at::text,
            ae.entity_type, ae.entity_id,
            c.id AS client_id, c.name AS client_name,
            p.id AS property_id, p.address AS property_address
     FROM activity_entries ae
     LEFT JOIN visits v ON ae.entity_type = 'visit' AND v.id = ae.entity_id
     LEFT JOIN jobs j ON (
       (ae.entity_type = 'job' AND j.id = ae.entity_id)
       OR (ae.entity_type = 'visit' AND j.id = v.job_id)
     )
     LEFT JOIN clients c ON c.id = COALESCE(j.client_id, v.client_id)
     LEFT JOIN properties p ON p.id = COALESCE(j.property_id, v.property_id)
     WHERE ae.account_id = $1 AND ae.user_id = $2
       AND ae.ended_at IS NULL AND ae.voided_at IS NULL
       AND ae.activity_type = ANY($3::text[])
     ORDER BY ae.started_at DESC
     LIMIT 1`,
    [accountId, userId, [...SITE_ACTIVITY_TYPES]],
  );

  const activeSiteSession: ActiveSiteSession | null = activeSite.rows[0]
    ? {
        activityEntryId: activeSite.rows[0].id,
        activityType: activeSite.rows[0].activity_type,
        startedAt: activeSite.rows[0].started_at,
        clientName: activeSite.rows[0].client_name,
        propertyAddress: activeSite.rows[0].property_address,
        entityType: activeSite.rows[0].entity_type,
        entityId: activeSite.rows[0].entity_id,
      }
    : null;

  if (activeSite.rows[0]?.client_name) {
    const row = activeSite.rows[0];
    return {
      likely: {
        clientId: row.client_id ?? "",
        clientName: row.client_name ?? "Customer",
        propertyId: row.property_id,
        propertyAddress: row.property_address,
        jobId: row.entity_type === "job" ? row.entity_id : null,
        visitId: row.entity_type === "visit" ? row.entity_id : null,
        source: "activity",
        confidence: 100,
        reason: "Site timer running",
      },
      activeSiteSession,
      openStopMinutes: null,
      confirmedStop: null,
    };
  }

  const openStop = await client.query<{
    id: string;
    latitude: number | null;
    longitude: number | null;
    started_at: string;
  }>(
    `SELECT id, latitude, longitude, started_at::text
     FROM location_segments
     WHERE account_id = $1 AND ended_at IS NULL AND kind = 'stop'
     ORDER BY started_at DESC
     LIMIT 1`,
    [accountId],
  );

  if (!openStop.rows[0]?.latitude || !openStop.rows[0]?.longitude) {
    return { likely: null, activeSiteSession, openStopMinutes: null, confirmedStop: null };
  }

  const openStopMinutes = Math.max(
    1,
    Math.round((Date.now() - new Date(openStop.rows[0].started_at).getTime()) / 60_000),
  );

  const confirmed = await resolveConfirmedStopMatch(client, accountId, {
    id: openStop.rows[0].id,
    latitude: openStop.rows[0].latitude,
    longitude: openStop.rows[0].longitude,
    started_at: openStop.rows[0].started_at,
    openStopMinutes,
  });

  if (!confirmed) {
    return { likely: null, activeSiteSession, openStopMinutes, confirmedStop: null };
  }

  return {
    likely: confirmed.likely,
    activeSiteSession,
    openStopMinutes,
    confirmedStop: confirmed.confirmedStop,
  };
}