import type { PoolClient } from "pg";
import {
  CLASSIFICATION_TO_ACTIVITY,
  FIELD_DAY_MIN_DURATION_MINUTES,
  activityCategoryFor,
  isFieldDayClassification,
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
  location_segment_id: string | null;
  property_id: string | null;
  matched_client_id: string | null;
  job_id: string | null;
  visit_id: string | null;
  work_order_id?: string | null;
  wo_resolution?: string | null;
  arrival_time: string;
  departure_time: string | null;
  duration_minutes?: number | null;
};

/**
 * Prefer work_order for billable assignment (arrival protocol);
 * fall back to visit → job → client.
 */
export function entityLinkFromCandidate(
  cand: Pick<PendingVisitCandidate, "job_id" | "visit_id" | "matched_client_id"> & {
    work_order_id?: string | null;
  },
): [string | null, string | null] {
  if (cand.work_order_id) return ["work_order", cand.work_order_id];
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
    endedAt: string | null;
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
  workOrderId?: string | null,
  jobId?: string | null,
): Promise<void> {
  await client.query(
    `UPDATE visit_candidates
     SET status = 'confirmed', classification = $1, activity_entry_id = $2,
         visit_id = COALESCE($5, visit_id),
         work_order_id = COALESCE($6, work_order_id),
         job_id = COALESCE($7, job_id),
         wo_resolution = 'resolved',
         confirmed_at = now(),
         updated_at = now()
     WHERE id = $3 AND account_id = $4`,
    [
      classification,
      entryId,
      candidateId,
      accountId,
      visitId ?? null,
      workOrderId ?? null,
      jobId ?? null,
    ],
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

/**
 * Any non-cancelled visit on this job for the local calendar date of `at`.
 * When workOrderId is set, only that work order's visits are considered
 * (multi-WO jobs must not steal each other's field days).
 */
export async function findVisitForJobOnDateIncludingCompleted(
  client: PoolClient,
  accountId: string,
  jobId: string,
  at: string,
  workOrderId?: string | null,
): Promise<string | null> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT v.id
     FROM visits v
     WHERE v.job_id = $1 AND v.account_id = $2
       AND (v.scheduled_start AT TIME ZONE 'America/New_York')::date
           = ($3::timestamptz AT TIME ZONE 'America/New_York')::date
       AND v.status <> 'cancelled'
       AND ($4::uuid IS NULL OR v.work_order_id = $4::uuid)
     ORDER BY
       CASE WHEN v.status = 'completed' THEN 1 ELSE 0 END,
       v.scheduled_start ASC
     LIMIT 1`,
    [jobId, accountId, at, workOrderId ?? null],
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

export type ApplyGpsPresenceResult = {
  updated: boolean;
  status: string | null;
  reason: string;
};

/**
 * Whether a confirmed/auto presence stop should flip the calendar visit to
 * completed (vs just arrived/in_progress). Field-day classifications with
 * real dwell complete; short blips only record that we showed up.
 */
export function shouldCompleteVisitFromPresence(opts: {
  classification: string;
  durationMinutes: number;
  minDurationMinutes?: number;
}): boolean {
  const min = opts.minDurationMinutes ?? FIELD_DAY_MIN_DURATION_MINUTES;
  if (opts.durationMinutes < min) return false;
  if (isFieldDayClassification(opts.classification)) return true;
  // Pre-sale site time also closes the calendar visit when substantial.
  return opts.classification === "estimate_visit"
    || opts.classification === "walkthrough";
}

/**
 * Walk a calendar visit through legal status transitions so GPS presence
 * shows as "I was there", and stamp arrived_at / completed_at from the stop.
 *
 * The DB trigger enforces scheduled→arrived→in_progress→completed and
 * overwrites times with now() on transition — so we walk first, then patch
 * GPS times in a status-unchanged UPDATE.
 */
export async function applyGpsPresenceToVisit(
  client: PoolClient,
  opts: {
    accountId: string;
    userId: string;
    visitId: string;
    arrivalTime: string;
    departureTime: string;
    /** When true, walk all the way to completed. When false, stop at in_progress. */
    complete: boolean;
  },
): Promise<ApplyGpsPresenceResult> {
  const { rows } = await client.query<{
    id: string;
    status: string;
    assigned_user_id: string | null;
    work_order_id: string | null;
  }>(
    `SELECT id, status, assigned_user_id, work_order_id
     FROM visits
     WHERE id = $1 AND account_id = $2
     FOR UPDATE`,
    [opts.visitId, opts.accountId],
  );
  const visit = rows[0];
  if (!visit) return { updated: false, status: null, reason: "not_found" };
  if (visit.status === "cancelled") {
    return { updated: false, status: visit.status, reason: "cancelled" };
  }

  // Arrived/in_progress require an assigned tech (DB trigger).
  if (!visit.assigned_user_id) {
    await client.query(
      `UPDATE visits SET assigned_user_id = $1, updated_at = now()
       WHERE id = $2 AND account_id = $3`,
      [opts.userId, opts.visitId, opts.accountId],
    );
  }

  let status = visit.status;

  async function step(to: string): Promise<void> {
    await client.query(
      `UPDATE visits SET status = $1, updated_at = now()
       WHERE id = $2 AND account_id = $3`,
      [to, opts.visitId, opts.accountId],
    );
    status = to;
  }

  // Legal walks only (matches validate_visit_transition).
  if (status === "scheduled" || status === "dispatched" || status === "traveling") {
    await step("arrived");
  }
  if (status === "arrived") {
    await step("in_progress");
  }
  if (status === "waiting" && opts.complete) {
    await step("in_progress");
  }
  if (opts.complete && status === "in_progress") {
    await step("completed");
  }

  // Stamp GPS window without changing status (trigger leaves times alone).
  await client.query(
    `UPDATE visits SET
       arrived_at = LEAST(COALESCE(arrived_at, $1::timestamptz), $1::timestamptz),
       completed_at = CASE
         WHEN status = 'completed'
           THEN GREATEST(COALESCE(completed_at, $2::timestamptz), $2::timestamptz)
         ELSE completed_at
       END,
       updated_at = now()
     WHERE id = $3 AND account_id = $4`,
    [opts.arrivalTime, opts.departureTime, opts.visitId, opts.accountId],
  );

  if (visit.work_order_id) {
    await syncWorkOrderStatus(client, visit.work_order_id, opts.accountId);
  }

  return {
    updated: true,
    status,
    reason: opts.complete && status === "completed" ? "completed" : "on_site",
  };
}

/**
 * Stamp GPS presence on a scheduled calendar visit when a stop matches.
 * Arrival → Assignment Protocol: does **not** write billable activity_entries
 * and does **not** mark the visit_candidate confirmed — human confirm owns labor.
 */
export async function autoRecordScheduledVisitPresence(
  client: PoolClient,
  opts: {
    accountId: string;
    userId: string;
    candidateId: string;
    visitId: string;
    jobId: string | null;
    arrivalTime: string;
    departureTime: string;
    durationMinutes: number;
    visitType?: string | null;
  },
): Promise<{ recorded: boolean; reason: string; activityEntryId?: string }> {
  // Classification from visit type (standard work vs pre-sale) — for presence walk only.
  const classification: Exclude<VisitClassification, "ignore"> =
    opts.visitType === "site_visit"
    || opts.visitType === "sales_walkthrough"
    || opts.visitType === "realtor_baseline"
      ? "estimate_visit"
      : "job_work";

  // Presence-only (E4 harden): never auto-complete from ingest. Human confirm
  // still uses shouldCompleteVisitFromPresence via ensureFieldDayVisit.
  void classification;
  void opts.durationMinutes;
  await applyGpsPresenceToVisit(client, {
    accountId: opts.accountId,
    userId: opts.userId,
    visitId: opts.visitId,
    arrivalTime: opts.arrivalTime,
    departureTime: opts.departureTime,
    complete: false,
  });

  // candidateId reserved for future audit linkage; intentionally not confirmed.
  void opts.candidateId;
  void opts.jobId;

  return {
    recorded: true,
    reason: "presence_only",
  };
}

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
    /** When known (e.g. Daily Recap scoped to a WO), skip multi-WO ambiguity. */
    workOrderId?: string | null;
    /** Note stored on auto-created visits (default: GPS confirm copy). */
    techNotes?: string | null;
  },
): Promise<EnsureFieldDayResult> {
  const durationMinutes = Math.max(
    0,
    Math.round(
      (new Date(opts.departureTime).getTime() - new Date(opts.arrivalTime).getTime()) / 60_000,
    ),
  );

  if (opts.visitId) {
    // Existing calendar visit: mark that we were on site and stamp GPS times.
    // (Previously we returned early and left the visit stuck on "scheduled".)
    await applyGpsPresenceToVisit(client, {
      accountId: opts.accountId,
      userId: opts.userId,
      visitId: opts.visitId,
      arrivalTime: opts.arrivalTime,
      departureTime: opts.departureTime,
      complete: shouldCompleteVisitFromPresence({
        classification: opts.classification,
        durationMinutes,
      }),
    });
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

  const { rows: jobRows } = await client.query<{ status: string }>(
    `SELECT status FROM jobs WHERE id = $1 AND account_id = $2`,
    [jobId, opts.accountId],
  );
  const jobStatus = jobRows[0]?.status;
  if (!jobStatus || jobStatus === "cancelled") {
    return { visitId: null, created: false, reason: "job_not_available" };
  }

  // Prefer an explicit WO (Daily Recap); must be bookable (draft→ready, not completed).
  // Else resolve so multi-WO jobs don't mis-attach.
  let workOrderId: string | null = null;
  if (opts.workOrderId) {
    workOrderId = await resolveWorkOrderForVisit(
      client,
      jobId,
      opts.accountId,
      opts.workOrderId,
    );
    if (!workOrderId) {
      return { visitId: null, created: false, reason: "work_order_not_bookable" };
    }
  } else {
    workOrderId = await resolveWorkOrderForFieldDay(client, jobId, opts.accountId);
  }
  if (!workOrderId) {
    return { visitId: null, created: false, reason: "ambiguous_work_order" };
  }

  // Serialize concurrent confirms for the same job + local day (txn-scoped).
  await client.query(
    `SELECT pg_advisory_xact_lock(
       hashtext($1::text),
       hashtext(($2::timestamptz AT TIME ZONE 'America/New_York')::date::text)
     )`,
    [jobId, opts.arrivalTime],
  );

  const existing = await findVisitForJobOnDateIncludingCompleted(
    client,
    opts.accountId,
    jobId,
    opts.arrivalTime,
    workOrderId,
  );
  if (existing) {
    await applyGpsPresenceToVisit(client, {
      accountId: opts.accountId,
      userId: opts.userId,
      visitId: existing,
      arrivalTime: opts.arrivalTime,
      departureTime: opts.departureTime,
      complete: shouldCompleteVisitFromPresence({
        classification: opts.classification,
        durationMinutes,
      }),
    });
    return { visitId: existing, created: false, reason: "existing_day" };
  }

  // Pad scheduled window to at least 1 hour for calendar display.
  const startMs = new Date(opts.arrivalTime).getTime();
  const endMs = Math.max(
    new Date(opts.departureTime).getTime(),
    startMs + 60 * 60 * 1000,
  );

  const techNotes = opts.techNotes ?? "Auto-created from confirmed on-site stop";
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
       $8
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
      techNotes,
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
