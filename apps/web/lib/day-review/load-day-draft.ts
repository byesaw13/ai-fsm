import { query, queryOne } from "@/lib/db";
import {
  assembleDayDraft,
  type ActivityType,
  type DayDraft,
  type DayDraftEvidenceCandidate,
  type DayDraftEvidenceExpense,
  type DayDraftEvidenceSegment,
} from "@ai-fsm/domain";

export async function loadDayDraft(accountId: string, date: string): Promise<DayDraft | null> {
  const day = await queryOne<{
    id: string;
    confidence_threshold: number;
  }>(
    `SELECT bd.id, a.visit_confidence_threshold AS confidence_threshold
     FROM business_days bd
     JOIN accounts a ON a.id = bd.account_id
     WHERE bd.account_id = $1 AND bd.business_date = $2::date`,
    [accountId, date],
  );
  if (!day) return null;

  const [segments, candidates, expenses, logged, clock, vehicle] = await Promise.all([
    query<DayDraftEvidenceSegment & {
      started_at: string;
      ended_at: string | null;
      place_label: string | null;
      suggested_activity_type: ActivityType | null;
      activity_entry_id: string | null;
      vehicle_id: string | null;
      estimated_miles: number | null;
      is_likely_noise: boolean;
    }>(
      `SELECT id, kind, started_at::text, ended_at::text, place_label, zone, status,
              activity_entry_id, suggested_activity_type, vehicle_id, is_likely_noise,
              ROUND((distance_meters / 1609.344)::numeric, 1)::float8 AS estimated_miles
       FROM location_segments
       WHERE account_id = $1 AND segment_date = $2::date
       ORDER BY started_at ASC`,
      [accountId, date],
    ),
    query<DayDraftEvidenceCandidate & {
      segment_id: string | null;
      client_name: string | null;
      property_address: string | null;
      job_id: string | null;
      visit_id: string | null;
      work_order_id: string | null;
      client_id: string | null;
      wo_resolution: string | null;
      visit_type: string | null;
      score: number;
    }>(
      `SELECT vc.id, vc.location_segment_id AS segment_id,
              c.name AS client_name, p.address AS property_address,
              vc.confidence_score AS score, vc.job_id, vc.visit_id, vc.work_order_id,
              vc.matched_client_id AS client_id, vc.wo_resolution,
              vis.visit_type
       FROM visit_candidates vc
       LEFT JOIN properties p ON p.id = vc.property_id
       LEFT JOIN clients c ON c.id = vc.matched_client_id
       LEFT JOIN visits vis ON vis.id = vc.visit_id
       WHERE vc.account_id = $1
         AND vc.status = 'pending'
         AND (vc.arrival_time AT TIME ZONE 'America/New_York')::date = $2::date`,
      [accountId, date],
    ),
    query<DayDraftEvidenceExpense & { vendor_name: string }>(
      `SELECT vendor_name, category, notes
       FROM expenses
       WHERE account_id = $1 AND expense_date = $2::date`,
      [accountId, date],
    ),
    query<{ started_at: string; ended_at: string }>(
      `SELECT started_at::text, ended_at::text
       FROM activity_entries
       WHERE account_id = $1 AND session_date = $2::date
         AND voided_at IS NULL AND ended_at IS NOT NULL`,
      [accountId, date],
    ),
    queryOne<{ minutes: string }>(
      `SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (
                COALESCE(clock_out_at, now()) - clock_in_at
              )) / 60), 0)::int::text AS minutes
       FROM time_clock_sessions
       WHERE account_id = $1 AND business_day_id = $2 AND voided_at IS NULL`,
      [accountId, day.id],
    ),
    queryOne<{ id: string }>(
      `SELECT id FROM vehicles
       WHERE account_id = $1 AND is_default = true
       ORDER BY created_at LIMIT 1`,
      [accountId],
    ),
  ]);

  const clockedMinutes = clock?.minutes != null ? parseInt(clock.minutes, 10) : null;

  return assembleDayDraft({
    segments: segments.map((s) => ({
      id: s.id,
      kind: s.kind,
      startedAt: s.started_at,
      endedAt: s.ended_at,
      placeLabel: s.place_label,
      zone: s.zone,
      status: s.status,
      activityEntryId: s.activity_entry_id,
      suggestedActivity: s.suggested_activity_type,
      vehicleId: s.vehicle_id,
      estimatedMiles: s.estimated_miles,
      isLikelyNoise: s.is_likely_noise,
    })),
    candidates: candidates.map((c) => ({
      id: c.id,
      segmentId: c.segment_id,
      clientName: c.client_name,
      propertyAddress: c.property_address,
      score: c.score,
      jobId: c.job_id,
      visitId: c.visit_id,
      workOrderId: c.work_order_id,
      clientId: c.client_id,
      woResolution: c.wo_resolution,
      visitType: c.visit_type,
    })),
    expenses: expenses.map((e) => ({
      vendor: e.vendor_name,
      category: e.category,
      notes: e.notes,
    })),
    loggedEntries: logged.map((e) => ({ startedAt: e.started_at, endedAt: e.ended_at })),
    clockedMinutes: Number.isFinite(clockedMinutes) ? clockedMinutes : null,
    defaultVehicleId: vehicle?.id ?? null,
    visitScoreFloor: day.confidence_threshold,
  });
}
