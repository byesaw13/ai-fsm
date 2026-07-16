import { query, queryOne } from "@/lib/db";
import { detectGaps, preSelectCandidates, checkMileageDelta, isPrivateLocation } from "@ai-fsm/domain";

export type DayReviewPayload = {
  businessDayId: string;
  date: string;
  status: string;
  reviewPromptedAt: string | null;
  closedAt: string | null;
  visits: {
    id: string;
    propertyName: string;
    clientName: string;
    arrivalTime: string;
    departureTime: string;
    durationMinutes: number;
    confidenceScore: number;
    preSelected: boolean;
    linkedJobId: string | null;
    classification: string | null;
    status: string;
  }[];
  segments: {
    id: string;
    kind: "stop" | "drive";
    startedAt: string;
    endedAt: string;
    placeLabel: string | null;
    zone: string | null;
    status: string;
    isLikelyNoise: boolean;
  }[];
  timeEntries: {
    id: string;
    activityType: string;
    entityLabel: string | null;
    note: string | null;
    startedAt: string;
    endedAt: string;
    durationMinutes: number;
  }[];
  gaps: { startsAt: string; endsAt: string; durationMinutes: number }[];
  mileage: {
    vehicleSessionId: string | null;
    vehicleName: string | null;
    odometerMiles: number | null;
    gpsMiles: number;
    deltaPercent: number | null;
    flagged: boolean;
  };
};

export async function getDayReview(
  accountId: string,
  date: string,
): Promise<DayReviewPayload | null> {
  const day = await queryOne<{
    id: string;
    status: string;
    review_prompted_at: string | null;
    closed_at: string | null;
    confidence_threshold: number;
    min_dwell: number;
  }>(
    `SELECT bd.id, bd.status,
            bd.review_prompted_at::text, bd.closed_at::text,
            a.visit_confidence_threshold AS confidence_threshold,
            a.min_stop_dwell_minutes AS min_dwell
     FROM business_days bd
     JOIN accounts a ON a.id = bd.account_id
     WHERE bd.account_id = $1 AND bd.business_date = $2::date`,
    [accountId, date],
  );
  if (!day) return null;

  const candidateRows = await query<{
    id: string;
    property_name: string;
    client_name: string;
    arrival_time: string;
    departure_time: string;
    duration_minutes: number;
    confidence_score: number;
    job_id: string | null;
    classification: string | null;
    status: string;
  }>(
    `SELECT vc.id, p.address AS property_name, c.name AS client_name,
            vc.arrival_time::text, vc.departure_time::text,
            vc.duration_minutes, vc.confidence_score,
            vc.job_id, vc.classification, vc.status
     FROM visit_candidates vc
     JOIN properties p ON p.id = vc.property_id
     JOIN clients c ON c.id = vc.matched_client_id
     WHERE vc.account_id = $1
       AND vc.arrival_time::date = $2::date
       AND vc.status = 'pending'
     ORDER BY vc.arrival_time ASC`,
    [accountId, date],
  );

  const scored = candidateRows.map((r) => ({
    id: r.id,
    confidenceScore: r.confidence_score,
    propertyName: r.property_name,
    clientName: r.client_name,
    arrivalTime: r.arrival_time,
    departureTime: r.departure_time,
    durationMinutes: r.duration_minutes,
    linkedJobId: r.job_id,
    classification: r.classification,
    status: r.status,
  }));
  const preSelectedIds = new Set(preSelectCandidates(scored, day.confidence_threshold).map((c) => c.id));

  const segmentRows = await query<{
    id: string;
    kind: "stop" | "drive";
    started_at: string;
    ended_at: string;
    place_label: string | null;
    zone: string | null;
    status: string;
    is_likely_noise: boolean;
  }>(
    `SELECT id, kind, started_at::text, ended_at::text,
            place_label, zone, status, is_likely_noise
     FROM location_segments
     WHERE account_id = $1 AND segment_date = $2::date AND ended_at IS NOT NULL
     ORDER BY started_at ASC`,
    [accountId, date],
  );

  const entryRows = await query<{
    id: string;
    activity_type: string;
    entity_label: string | null;
    note: string | null;
    started_at: string;
    ended_at: string;
    duration_minutes: number;
  }>(
    `SELECT ae.id, ae.activity_type, ae.note,
            ae.started_at::text AS started_at, ae.ended_at::text AS ended_at,
            ROUND(EXTRACT(EPOCH FROM (ae.ended_at - ae.started_at)) / 60)::int AS duration_minutes,
            CASE ae.entity_type
              WHEN 'job'      THEN j.title
              WHEN 'visit'    THEN vjob.title
              WHEN 'estimate' THEN 'Estimate ' || COALESCE(est.estimate_number, '')
              WHEN 'invoice'  THEN 'Invoice ' || COALESCE(inv.invoice_number, '')
              WHEN 'client'   THEN cli.name
              ELSE NULL
            END AS entity_label
     FROM activity_entries ae
     LEFT JOIN jobs j        ON ae.entity_type = 'job'      AND j.id   = ae.entity_id AND j.account_id   = ae.account_id
     LEFT JOIN visits vis    ON ae.entity_type = 'visit'    AND vis.id = ae.entity_id AND vis.account_id = ae.account_id
     LEFT JOIN jobs vjob     ON vjob.id = vis.job_id AND vjob.account_id = ae.account_id
     LEFT JOIN estimates est ON ae.entity_type = 'estimate' AND est.id = ae.entity_id AND est.account_id = ae.account_id
     LEFT JOIN invoices inv  ON ae.entity_type = 'invoice'  AND inv.id = ae.entity_id AND inv.account_id = ae.account_id
     LEFT JOIN clients cli   ON ae.entity_type = 'client'   AND cli.id = ae.entity_id AND cli.account_id = ae.account_id
     WHERE ae.account_id = $1 AND ae.session_date = $2::date
       AND ae.voided_at IS NULL AND ae.ended_at IS NOT NULL
     ORDER BY ae.started_at ASC`,
    [accountId, date],
  );

  const reportableSegments = segmentRows.filter((s) => !isPrivateLocation(s.zone, s.place_label));

  const gaps = detectGaps(
    reportableSegments.map((s) => ({ startedAt: s.started_at, endedAt: s.ended_at })),
    entryRows.map((e) => ({ startedAt: e.started_at, endedAt: e.ended_at })),
    day.min_dwell,
  );

  const mileageRow = await queryOne<{
    vehicle_session_id: string | null;
    vehicle_name: string | null;
    odometer_miles: number | null;
    gps_meters: string | null;
  }>(
    `SELECT vs.id AS vehicle_session_id,
            v.nickname AS vehicle_name,
            COALESCE(
              vs.miles,
              (vs.end_odometer - vs.start_odometer)::numeric
            )::float8 AS odometer_miles,
            SUM(ls.distance_meters)::text AS gps_meters
     FROM vehicle_sessions vs
     LEFT JOIN vehicles v ON v.id = vs.vehicle_id
     LEFT JOIN location_segments ls
       ON ls.account_id = vs.account_id
       AND ls.segment_date = vs.session_date
       AND ls.kind = 'drive'
       AND ls.status = 'confirmed'
     WHERE vs.account_id = $1 AND vs.session_date = $2::date
       AND vs.status <> 'voided'
     GROUP BY vs.id, v.nickname, vs.miles, vs.start_odometer, vs.end_odometer
     ORDER BY vs.started_at DESC NULLS LAST
     LIMIT 1`,
    [accountId, date],
  );

  const gpsMiles = mileageRow?.gps_meters ? Number(mileageRow.gps_meters) / 1609.34 : 0;
  const delta = checkMileageDelta(mileageRow?.odometer_miles ?? null, gpsMiles);

  return {
    businessDayId: day.id,
    date,
    status: day.status,
    reviewPromptedAt: day.review_prompted_at,
    closedAt: day.closed_at,
    visits: scored.map((c) => ({ ...c, preSelected: preSelectedIds.has(c.id) })),
    segments: reportableSegments.map((s) => ({
      id: s.id,
      kind: s.kind,
      startedAt: s.started_at,
      endedAt: s.ended_at,
      placeLabel: s.place_label,
      zone: s.zone,
      status: s.status,
      isLikelyNoise: s.is_likely_noise,
    })),
    timeEntries: entryRows.map((e) => ({
      id: e.id,
      activityType: e.activity_type,
      entityLabel: e.entity_label,
      note: e.note,
      startedAt: e.started_at,
      endedAt: e.ended_at,
      durationMinutes: e.duration_minutes,
    })),
    gaps,
    mileage: {
      vehicleSessionId: mileageRow?.vehicle_session_id ?? null,
      vehicleName: mileageRow?.vehicle_name ?? null,
      odometerMiles: mileageRow?.odometer_miles ?? null,
      gpsMiles: Math.round(gpsMiles * 10) / 10,
      deltaPercent: delta.deltaPercent,
      flagged: delta.flagged,
    },
  };
}
