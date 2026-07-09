import type { PoolClient } from "pg";
import {
  CLASSIFICATION_TO_ACTIVITY,
  activityCategoryFor,
  type VisitClassification,
} from "@ai-fsm/domain";

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

export function entityLinkFromCandidate(
  cand: Pick<PendingVisitCandidate, "job_id" | "visit_id" | "matched_client_id">,
): [string | null, string | null] {
  if (cand.job_id) return ["job", cand.job_id];
  if (cand.visit_id) return ["visit", cand.visit_id];
  if (cand.matched_client_id) return ["client", cand.matched_client_id];
  return [null, null];
}

export async function learnPropertyCoordsFromSegment(
  client: PoolClient,
  propertyId: string,
  accountId: string,
  segmentId: string,
): Promise<void> {
  await client.query(
    `UPDATE properties p
     SET latitude = s.latitude, longitude = s.longitude,
         coordinate_source = 'confirmed_visit', coordinate_confidence = 'confirmed',
         coordinate_updated_at = now(), updated_at = now()
     FROM location_segments s
     WHERE p.id = $1 AND p.account_id = $2 AND p.latitude IS NULL
       AND s.id = $3 AND s.latitude IS NOT NULL AND s.longitude IS NOT NULL`,
    [propertyId, accountId, segmentId],
  );
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
): Promise<void> {
  await client.query(
    `UPDATE visit_candidates
     SET status = 'confirmed', classification = $1, activity_entry_id = $2, updated_at = now()
     WHERE id = $3 AND account_id = $4`,
    [classification, entryId, candidateId, accountId],
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