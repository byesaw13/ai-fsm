import { query, queryOne } from "@/lib/db";
import {
  defaultStopReason,
  isOpenJobStatus,
  isPrivateLocation,
  looksLikeStorePlace,
  shouldSkipNightStopInterview,
  stopReasonOptions,
  type HomeFence,
  type StopReason,
} from "@ai-fsm/domain";

export type StopInterviewCard = {
  segmentId: string;
  startedAt: string;
  endedAt: string | null;
  minutes: number;
  stillThere: boolean;
  placeLabel: string;
  candidateId: string | null;
  propertyId: string | null;
  clientId: string | null;
  clientName: string | null;
  propertyAddress: string | null;
  openJob: { id: string; number: string; title: string } | null;
  lastClosedJob: { id: string; number: string; title: string; status: string } | null;
  options: StopReason[];
  suggested: StopReason | null;
  answeredReason: StopReason | null;
  answeredNotes: string | null;
};

export type StopInterviewReceipt = {
  id: string;
  vendorName: string;
  amountCents: number;
  category: string;
};

export type StopInterviewPayload = {
  date: string;
  stops: StopInterviewCard[];
  unansweredCount: number;
  receipts: StopInterviewReceipt[];
  jobTargets: { id: string; label: string }[];
};

export async function loadStopInterview(
  accountId: string,
  date: string,
): Promise<StopInterviewPayload> {
  const [homeRow, segments, openJobs, closedJobs, receipts, closedOutToday] = await Promise.all([
    queryOne<{
      home_latitude: number | null;
      home_longitude: number | null;
      home_radius_meters: number | null;
    }>(
      `SELECT home_latitude, home_longitude, home_radius_meters
         FROM accounts WHERE id = $1`,
      [accountId],
    ),
    query<{
      id: string;
      started_at: string;
      ended_at: string | null;
      latitude: number | null;
      longitude: number | null;
      place_label: string | null;
      zone: string | null;
      stop_reason: string | null;
      stop_notes: string | null;
      candidate_id: string | null;
      property_id: string | null;
      client_id: string | null;
      client_name: string | null;
      property_address: string | null;
    }>(
      `SELECT s.id, s.started_at::text, s.ended_at::text, s.latitude, s.longitude,
              s.place_label, s.zone,
              s.stop_reason, s.stop_notes,
              vc.id AS candidate_id, vc.property_id,
              vc.matched_client_id AS client_id,
              c.name AS client_name, p.address AS property_address
       FROM location_segments s
       LEFT JOIN visit_candidates vc ON vc.location_segment_id = s.id AND vc.account_id = s.account_id
       LEFT JOIN properties p ON p.id = vc.property_id
       LEFT JOIN clients c ON c.id = vc.matched_client_id
       WHERE s.account_id = $1
         AND s.segment_date = $2::date
         AND s.kind = 'stop'
         AND s.status <> 'dismissed'
         AND COALESCE(s.is_likely_noise, false) = false
       ORDER BY s.started_at ASC`,
      [accountId, date],
    ),
    query<{
      id: string;
      property_id: string;
      job_number: string;
      title: string;
      status: string;
    }>(
      `SELECT DISTINCT ON (property_id) id, property_id, job_number, title, status
       FROM jobs
       WHERE account_id = $1
         AND property_id IS NOT NULL
         AND status IN ('draft', 'quoted', 'scheduled', 'in_progress')
       ORDER BY property_id, updated_at DESC`,
      [accountId],
    ),
    query<{
      id: string;
      property_id: string;
      job_number: string;
      title: string;
      status: string;
    }>(
      `SELECT DISTINCT ON (property_id) id, property_id, job_number, title, status
       FROM jobs
       WHERE account_id = $1
         AND property_id IS NOT NULL
         AND status IN ('completed', 'invoiced')
       ORDER BY property_id, updated_at DESC`,
      [accountId],
    ),
    query<StopInterviewReceipt & { vendor_name: string; amount_cents: number }>(
      `SELECT id, vendor_name, amount_cents, category
       FROM expenses
       WHERE account_id = $1
         AND expense_date = $2::date
         AND job_id IS NULL
         AND reviewed_at IS NULL
       ORDER BY created_at`,
      [accountId, date],
    ),
    query<{ property_id: string }>(
      `SELECT DISTINCT j.property_id
         FROM visits v
         JOIN jobs j ON j.id = v.job_id AND j.account_id = v.account_id
        WHERE v.account_id = $1
          AND v.closeout_kind = 'done'
          AND v.status = 'completed'
          AND j.property_id IS NOT NULL
          AND timezone('America/New_York', COALESCE(v.completed_at, v.updated_at))::date = $2::date`,
      [accountId, date],
    ),
  ]);

  const openByProperty = new Map(openJobs.map((j) => [j.property_id, j]));
  const closedByProperty = new Map(closedJobs.map((j) => [j.property_id, j]));
  const closedOutPropertyIds = new Set(
    closedOutToday.map((r) => r.property_id).filter((id): id is string => Boolean(id)),
  );
  const home: HomeFence | null =
    homeRow?.home_latitude != null && homeRow?.home_longitude != null
      ? {
          latitude: homeRow.home_latitude,
          longitude: homeRow.home_longitude,
          radiusMeters: homeRow.home_radius_meters ?? undefined,
        }
      : null;

  const stops: StopInterviewCard[] = [];
  const now = Date.now();
  for (const s of segments) {
    if (
      isPrivateLocation(s.zone, s.place_label, {
        latitude: s.latitude,
        longitude: s.longitude,
        home,
      })
    ) {
      continue;
    }
    if (
      shouldSkipNightStopInterview({
        answeredReason: s.stop_reason,
        propertyId: s.property_id,
        closedOutPropertyIds,
      }) &&
      !s.stop_reason
    ) {
      continue;
    }
    const place = s.place_label ?? s.zone ?? "Stop";
    const open = s.property_id ? openByProperty.get(s.property_id) : undefined;
    const closed = s.property_id ? closedByProperty.get(s.property_id) : undefined;
    const hasOpenJob = Boolean(open && isOpenJobStatus(open.status));
    const hasProperty = Boolean(s.property_id);
    const started = new Date(s.started_at).getTime();
    const ended = s.ended_at ? new Date(s.ended_at).getTime() : now;
    stops.push({
      segmentId: s.id,
      startedAt: s.started_at,
      endedAt: s.ended_at,
      stillThere: s.ended_at == null,
      minutes: Math.max(0, Math.round((ended - started) / 60000)),
      placeLabel: place,
      candidateId: s.candidate_id,
      propertyId: s.property_id,
      clientId: s.client_id,
      clientName: s.client_name,
      propertyAddress: s.property_address,
      openJob: open
        ? { id: open.id, number: open.job_number, title: open.title }
        : null,
      lastClosedJob: !open && closed
        ? {
            id: closed.id,
            number: closed.job_number,
            title: closed.title,
            status: closed.status,
          }
        : null,
      options: stopReasonOptions({ hasOpenJob, hasProperty }),
      suggested: defaultStopReason({
        hasOpenJob,
        looksLikeStore: looksLikeStorePlace(place),
      }),
      answeredReason: (s.stop_reason as StopReason | null) ?? null,
      answeredNotes: s.stop_notes,
    });
  }

  const jobTargets = [
    ...openJobs.map((j) => ({
      id: j.id,
      label: `${j.job_number} · ${j.title}`,
    })),
  ];

  return {
    date,
    stops,
    unansweredCount: stops.filter((s) => !s.answeredReason).length,
    receipts: receipts.map((r) => ({
      id: r.id,
      vendorName: r.vendor_name,
      amountCents: r.amount_cents,
      category: r.category,
    })),
    jobTargets,
  };
}
