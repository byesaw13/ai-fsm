import type { PoolClient } from "pg";

export interface EstimateNotStartedReminder {
  visitId: string;
  jobId: string;
  clientId: string;
  clientName: string;
  jobTitle: string | null;
  propertyAddress: string | null;
  assessmentCompletedAt: string;
  hoursSince: number;
}

export async function loadEstimateNotStartedReminder(
  client: PoolClient,
  accountId: string,
  userId: string,
): Promise<EstimateNotStartedReminder | null> {
  const result = await client.query<{
    visit_id: string;
    job_id: string;
    client_id: string;
    client_name: string;
    job_title: string | null;
    property_address: string | null;
    assessment_completed_at: string;
    hours_since: string;
  }>(
    `SELECT v.id AS visit_id, j.id AS job_id, c.id AS client_id, c.name AS client_name,
            j.title AS job_title, p.address AS property_address,
            a.completed_at::text AS assessment_completed_at,
            EXTRACT(EPOCH FROM (now() - a.completed_at)) / 3600 AS hours_since
     FROM visits v
     JOIN jobs j ON j.id = v.job_id
     JOIN clients c ON c.id = j.client_id
     LEFT JOIN properties p ON p.id = j.property_id
     JOIN site_visit_assessments a ON a.visit_id = v.id AND a.account_id = v.account_id
     WHERE v.account_id = $1
       AND v.assigned_user_id = $2
       AND v.visit_type IN ('site_visit', 'sales_walkthrough')
       AND v.status = 'completed'
       AND a.completed_at IS NOT NULL
       AND a.completed_at < now() - interval '24 hours'
       AND NOT EXISTS (
         SELECT 1 FROM estimates e
         WHERE e.account_id = v.account_id AND e.job_id = j.id
       )
       AND NOT EXISTS (
         SELECT 1 FROM user_prompt_mutes m
         WHERE m.account_id = $1 AND m.user_id = $2
           AND m.prompt_key = 'estimate_not_started:' || v.id::text
           AND m.muted_until > now()
       )
     ORDER BY a.completed_at ASC
     LIMIT 1`,
    [accountId, userId],
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    visitId: row.visit_id,
    jobId: row.job_id,
    clientId: row.client_id,
    clientName: row.client_name,
    jobTitle: row.job_title,
    propertyAddress: row.property_address,
    assessmentCompletedAt: row.assessment_completed_at,
    hoursSince: Math.round(parseFloat(row.hours_since)),
  };
}