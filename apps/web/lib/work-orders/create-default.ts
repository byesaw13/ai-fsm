/**
 * Create a default schedulable work order for a project (e.g. quick-book).
 */

import type { PoolClient } from "pg";

export async function createDefaultWorkOrderForJob({
  client,
  accountId,
  clientId,
  jobId,
  title,
  scope,
  createdBy,
}: {
  client: PoolClient;
  accountId: string;
  clientId: string;
  jobId: string;
  title: string;
  scope?: string | null;
  createdBy: string;
}): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO work_orders (account_id, client_id, job_id, title, scope, status, created_by)
     VALUES ($1, $2, $3, $4, $5, 'ready', $6)
     RETURNING id`,
    [accountId, clientId, jobId, title, scope ?? null, createdBy],
  );
  return rows[0].id;
}