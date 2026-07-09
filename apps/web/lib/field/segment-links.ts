import type { PoolClient } from "pg";
import {
  assertClientInAccount,
  assertJobForClient,
  assertPropertyForClient,
} from "@/lib/documents/document-links";

export interface SegmentLinkInput {
  clientId: string;
  propertyId?: string | null;
  jobId?: string | null;
}

export interface ResolvedSegmentLinks {
  clientId: string;
  clientName: string;
  propertyId: string | null;
  propertyAddress: string | null;
  jobId: string | null;
  jobTitle: string | null;
  visitId: string | null;
}

export async function resolveSegmentLinks(
  client: PoolClient,
  accountId: string,
  input: SegmentLinkInput,
): Promise<ResolvedSegmentLinks> {
  const cli = await assertClientInAccount(client, accountId, input.clientId);

  let propertyId = input.propertyId ?? null;
  let propertyAddress: string | null = null;
  let jobId = input.jobId ?? null;
  let jobTitle: string | null = null;
  let visitId: string | null = null;

  if (jobId) {
    const job = await assertJobForClient(client, accountId, jobId, input.clientId);
    jobTitle = job.title;
    if (!propertyId && job.property_id) {
      propertyId = job.property_id;
    }
  }

  if (propertyId) {
    const prop = await assertPropertyForClient(client, accountId, propertyId, input.clientId);
    propertyAddress = prop.address;
  }

  return {
    clientId: cli.id,
    clientName: cli.name,
    propertyId,
    propertyAddress,
    jobId,
    jobTitle,
    visitId,
  };
}

export async function findVisitForJobOnDate(
  client: PoolClient,
  accountId: string,
  jobId: string,
  segmentDate: string,
): Promise<string | null> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT v.id
     FROM visits v
     WHERE v.job_id = $1 AND v.account_id = $2
       AND v.scheduled_start::date = $3::date
       AND v.status NOT IN ('completed', 'cancelled')
     ORDER BY v.scheduled_start ASC
     LIMIT 1`,
    [jobId, accountId, segmentDate],
  );
  return rows[0]?.id ?? null;
}

export async function upsertSegmentVisitCandidate(
  client: PoolClient,
  opts: {
    accountId: string;
    segmentId: string;
    startedAt: string;
    endedAt: string;
    links: ResolvedSegmentLinks;
    visitId: string | null;
  },
): Promise<{ id: string }> {
  const durationMinutes = Math.max(
    1,
    Math.round((new Date(opts.endedAt).getTime() - new Date(opts.startedAt).getTime()) / 60000),
  );

  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO visit_candidates
       (account_id, location_segment_id, property_id, matched_client_id, job_id, visit_id,
        confidence_score, arrival_time, departure_time, duration_minutes, status, source)
     VALUES ($1, $2, $3, $4, $5, $6, 100, $7, $8, $9, 'pending', 'manual')
     ON CONFLICT (location_segment_id) DO UPDATE SET
       property_id = EXCLUDED.property_id,
       matched_client_id = EXCLUDED.matched_client_id,
       job_id = EXCLUDED.job_id,
       visit_id = EXCLUDED.visit_id,
       confidence_score = 100,
       arrival_time = EXCLUDED.arrival_time,
       departure_time = EXCLUDED.departure_time,
       duration_minutes = EXCLUDED.duration_minutes,
       status = 'pending',
       classification = NULL,
       source = 'manual',
       updated_at = now()
     RETURNING id`,
    [
      opts.accountId,
      opts.segmentId,
      opts.links.propertyId,
      opts.links.clientId,
      opts.links.jobId,
      opts.visitId,
      opts.startedAt,
      opts.endedAt,
      durationMinutes,
    ],
  );
  return rows[0];
}