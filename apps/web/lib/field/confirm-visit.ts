import type { PoolClient } from "pg";
import {
  CLASSIFICATION_TO_ACTIVITY,
  activityCategoryFor,
  shouldEnsureFieldDayVisit,
  shouldRelearnPropertyCoords,
  type VisitClassification,
} from "@ai-fsm/domain";
import {
  resolveWorkOrderForVisit,
  syncWorkOrderStatus,
} from "@/lib/work-orders/sync-status";

export type PendingVisitCandidate = {
  id: string;
  location_segment_id: string;
  property_id: string | null;
  matched_client_id: string | null;
  job_id: string | null;
  visit_id: string | null;
  arrival_time: string;
  departure_time: string;
};

/** Prefer the field-day visit when present so labor attaches to the calendar day. */
export function entityLinkFromCandidate(
  cand: Pick<PendingVisitCandidate, "job_id" | "visit_id" | "matched_client_id">,
): [string | null, string | null] {
  if (cand.visit_id) return ["visit", cand.visit_id];
  if (cand.job_id) return ["job", cand.job_id];
  if (cand.matched_client_id) return ["client", cand.matched_client_id];
  return [null, null];
}

/**
 * Bootstrap missing property coords, or overwrite when a confirmed stop is far
 * from the stored pin (poisoned first-confirm).
 */
export async function learnPropertyCoordsFromSegment(
  client: PoolClient,
  propertyId: string,
  accountId: string,
  segmentId: string,
): Promise<{ updated: boolean; reason: string }> {
  const { rows } = await client.query<{
    prop_lat: number | null;
    prop_lng: number | null;
    stop_lat: number | null;
    stop_lng: number | null;
  }>(
    `SELECT p.latitude AS prop_lat, p.longitude AS prop_lng,
            s.latitude AS stop_lat, s.longitude AS stop_lng
     FROM properties p
     JOIN location_segments s ON s.id = $3 AND s.account_id = $2
     WHERE p.id = $1 AND p.account_id = $2`,
    [propertyId, accountId, segmentId],
  );
  const row = rows[0];
  if (!row) return { updated: false, reason: "not_found" };

  const decision = shouldRelearnPropertyCoords({
    storedLatitude: row.prop_lat,
    storedLongitude: row.prop_lng,
    stopLatitude: row.stop_lat,
    stopLongitude: row.stop_lng,
  });
  if (!decision.relearn) {
    return { updated: false, reason: decision.reason };
  }

  await client.query(
    `UPDATE properties p
     SET latitude = s.latitude, longitude = s.longitude,
         coordinate_source = 'confirmed_visit', coordinate_confidence = 'confirmed',
         coordinate_updated_at = now(), updated_at = now()
     FROM location_segments s
     WHERE p.id = $1 AND p.account_id = $2
       AND s.id = $3 AND s.latitude IS NOT NULL AND s.longitude IS NOT NULL`,
    [propertyId, accountId, segmentId],
  );
  return { updated: true, reason: decision.reason };
}

export async function insertVisitActivityEntry(
  client: PoolClient,
  opts: {
    accountId: string;
    userId: string;
    sessionDate: string;
    classification: Exclude<VisitClassification, "ignore">;
    startedAt: string;
    endedAt: string;
    entityType: string | null;
    entityId: string | null;
    note: string | null;
    businessDayId: string | null;
    source: "auto_visit" | "backfill";
  },
): Promise<string> {
  const activityType = CLASSIFICATION_TO_ACTIVITY[opts.classification];
  const category = activityCategoryFor(activityType);
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO activity_entries
       (account_id, user_id, session_date, activity_type, category,
        started_at, ended_at, entity_type, entity_id, source, note, business_day_id)
     VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [
      opts.accountId,
      opts.userId,
      opts.sessionDate,
      activityType,
      category,
      opts.startedAt,
      opts.endedAt,
      opts.entityType,
      opts.entityId,
      opts.source,
      opts.note,
      opts.businessDayId,
    ],
  );
  return rows[0].id;
}

export async function markVisitCandidateConfirmed(
  client: PoolClient,
  candidateId: string,
  accountId: string,
  classification: Exclude<VisitClassification, "ignore">,
  entryId: string,
  visitId?: string | null,
): Promise<void> {
  await client.query(
    `UPDATE visit_candidates
     SET status = 'confirmed', classification = $1, activity_entry_id = $2,
         visit_id = COALESCE($5, visit_id), updated_at = now()
     WHERE id = $3 AND account_id = $4`,
    [classification, entryId, candidateId, accountId, visitId ?? null],
  );
}

export async function ignoreVisitCandidateForSegment(
  client: PoolClient,
  segmentId: string,
  accountId: string,
): Promise<void> {
  await client.query(
    `UPDATE visit_candidates
     SET status = 'ignored', classification = 'ignore', updated_at = now()
     WHERE location_segment_id = $1 AND account_id = $2 AND status = 'pending'`,
    [segmentId, accountId],
  );
}

/** Any non-cancelled visit on this job for the local calendar date of `at`. */
export async function findVisitForJobOnDateIncludingCompleted(
  client: PoolClient,
  accountId: string,
  jobId: string,
  at: string,
): Promise<string | null> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT v.id
     FROM visits v
     WHERE v.job_id = $1 AND v.account_id = $2
       AND (v.scheduled_start AT TIME ZONE 'America/New_York')::date
           = ($3::timestamptz AT TIME ZONE 'America/New_York')::date
       AND v.status <> 'cancelled'
     ORDER BY
       CASE WHEN v.status = 'completed' THEN 1 ELSE 0 END,
       v.scheduled_start ASC
     LIMIT 1`,
    [jobId, accountId, at],
  );
  return rows[0]?.id ?? null;
}

/**
 * Resolve a work order for historical field-day creation:
 * prefer a single bookable WO; else the sole non-cancelled WO on the job.
 */
async function resolveWorkOrderForFieldDay(
  client: PoolClient,
  jobId: string,
  accountId: string,
): Promise<string | null> {
  const bookable = await resolveWorkOrderForVisit(client, jobId, accountId, null);
  if (bookable) return bookable;

  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM work_orders
     WHERE job_id = $1 AND account_id = $2 AND status <> 'cancelled'
     ORDER BY created_at ASC`,
    [jobId, accountId],
  );
  if (rows.length === 1) return rows[0].id;
  return null;
}

export type EnsureFieldDayResult = {
  visitId: string | null;
  created: boolean;
  reason: string;
};

/**
 * On confirm of field work for a job: reuse today's visit or auto-create a
 * completed standard field day under the work order (multi-day T&M).
 */
export async function ensureFieldDayVisit(
  client: PoolClient,
  opts: {
    accountId: string;
    userId: string;
    jobId: string | null;
    visitId: string | null;
    classification: string;
    arrivalTime: string;
    departureTime: string;
  },
): Promise<EnsureFieldDayResult> {
  const durationMinutes = Math.max(
    0,
    Math.round(
      (new Date(opts.departureTime).getTime() - new Date(opts.arrivalTime).getTime()) / 60_000,
    ),
  );

  if (opts.visitId) {
    return { visitId: opts.visitId, created: false, reason: "candidate_visit" };
  }

  if (
    !shouldEnsureFieldDayVisit({
      classification: opts.classification,
      jobId: opts.jobId,
      durationMinutes,
    })
  ) {
    return {
      visitId: null,
      created: false,
      reason: !opts.jobId
        ? "no_job"
        : durationMinutes < 15
          ? "too_short"
          : "not_field_classification",
    };
  }

  const jobId = opts.jobId!;
  const existing = await findVisitForJobOnDateIncludingCompleted(
    client,
    opts.accountId,
    jobId,
    opts.arrivalTime,
  );
  if (existing) {
    return { visitId: existing, created: false, reason: "existing_day" };
  }

  const { rows: jobRows } = await client.query<{ status: string }>(
    `SELECT status FROM jobs WHERE id = $1 AND account_id = $2`,
    [jobId, opts.accountId],
  );
  const jobStatus = jobRows[0]?.status;
  if (!jobStatus || jobStatus === "cancelled") {
    return { visitId: null, created: false, reason: "job_not_available" };
  }

  const workOrderId = await resolveWorkOrderForFieldDay(client, jobId, opts.accountId);
  if (!workOrderId) {
    return { visitId: null, created: false, reason: "ambiguous_work_order" };
  }

  // Pad scheduled window to at least 1 hour for calendar display.
  const startMs = new Date(opts.arrivalTime).getTime();
  const endMs = Math.max(
    new Date(opts.departureTime).getTime(),
    startMs + 60 * 60 * 1000,
  );

  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO visits (
       account_id, job_id, work_order_id, assigned_user_id,
       visit_type, status,
       scheduled_start, scheduled_end, arrived_at, completed_at,
       tech_notes
     ) VALUES (
       $1, $2, $3, $4,
       'standard', 'completed',
       $5, $6, $5, $7,
       'Auto-created from confirmed on-site stop'
     )
     RETURNING id`,
    [
      opts.accountId,
      jobId,
      workOrderId,
      opts.userId,
      opts.arrivalTime,
      new Date(endMs).toISOString(),
      opts.departureTime,
    ],
  );

  const visitId = rows[0]?.id ?? null;
  if (visitId) {
    await syncWorkOrderStatus(client, workOrderId, opts.accountId);
  }

  return {
    visitId,
    created: visitId != null,
    reason: visitId ? "created" : "insert_failed",
  };
}
