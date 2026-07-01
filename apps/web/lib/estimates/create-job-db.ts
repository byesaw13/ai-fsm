/**
 * Shared DB logic for creating a job from an approved estimate.
 * Used by both the authenticated API route and the portal acceptance handler.
 *
 * Callers are responsible for the transaction lifecycle. Pass an already-connected
 * pg PoolClient with BEGIN already called (or let the function handle the query
 * inside an existing transaction).
 */

import type { PoolClient } from "pg";
import { deriveJobTitle, deriveJobDescription } from "./job-from-estimate";
import { promoteOrCreateWorkOrderFromEstimate } from "../work-orders/from-estimate";

interface CreateJobFromEstimateOptions {
  client: PoolClient;
  estimateId: string;
  accountId: string;
  /** Used as jobs.created_by. For portal-triggered creation, pass the account owner's user_id. */
  createdBy: string;
  traceId?: string;
}

interface CreateJobResult {
  jobId: string;
  created: boolean;
  workOrderId?: string;
  workOrderCreated?: boolean;
}

/**
 * Idempotent: if the estimate already has a linked job, returns it without
 * creating a new one. Caller must hold a FOR UPDATE lock on the estimate row
 * or otherwise ensure serialization.
 */
export async function createJobFromEstimate({
  client,
  estimateId,
  accountId,
  createdBy,
}: CreateJobFromEstimateOptions): Promise<CreateJobResult> {
  const estRes = await client.query<{
    id: string;
    status: string;
    client_id: string;
    property_id: string | null;
    job_id: string | null;
    booking_request_id: string | null;
    notes: string | null;
    total_cents: number;
    client_name: string | null;
    property_address: string | null;
  }>(
    `SELECT e.id, e.status, e.client_id, e.property_id, e.job_id, e.booking_request_id,
            e.notes, e.total_cents,
            c.name AS client_name,
            p.address AS property_address
     FROM estimates e
     LEFT JOIN clients c ON c.id = e.client_id
     LEFT JOIN properties p ON p.id = e.property_id
     WHERE e.id = $1 AND e.account_id = $2
     FOR UPDATE OF e`,
    [estimateId, accountId]
  );

  if (estRes.rowCount === 0) {
    throw Object.assign(new Error("Estimate not found"), { code: "NOT_FOUND" });
  }

  const est = estRes.rows[0];

  if (est.status !== "approved") {
    throw Object.assign(
      new Error(`Only approved estimates can spawn a job (status: ${est.status})`),
      { code: "INVALID_TRANSITION" }
    );
  }

  // Idempotent — already has a job; ensure a work order exists too.
  if (est.job_id) {
    const wo = await promoteOrCreateWorkOrderFromEstimate({
      client,
      estimateId,
      jobId: est.job_id,
      accountId,
      createdBy,
    });
    return {
      jobId: est.job_id,
      created: false,
      workOrderId: wo.workOrderId,
      workOrderCreated: wo.created,
    };
  }

  const title = deriveJobTitle({
    notes: est.notes,
    property_address: est.property_address,
    client_name: est.client_name,
    total_cents: est.total_cents,
  });
  const description = deriveJobDescription({
    notes: est.notes,
    property_address: est.property_address,
    client_name: est.client_name,
    total_cents: est.total_cents,
  });

  const jobRes = await client.query<{ id: string }>(
    `INSERT INTO jobs
       (account_id, client_id, property_id, title, description,
        status, job_type, booking_request_id, created_by)
     VALUES ($1, $2, $3, $4, $5, 'quoted', 'custom', $6, $7)
     RETURNING id`,
    [
      accountId,
      est.client_id,
      est.property_id,
      title,
      description,
      est.booking_request_id ?? null,
      createdBy,
    ]
  );
  const jobId = jobRes.rows[0].id;

  // Link the estimate to the new job.
  await client.query(
    `UPDATE estimates SET job_id = $1 WHERE id = $2`,
    [jobId, estimateId]
  );

  const wo = await promoteOrCreateWorkOrderFromEstimate({
    client,
    estimateId,
    jobId,
    accountId,
    createdBy,
  });

  return {
    jobId,
    created: true,
    workOrderId: wo.workOrderId,
    workOrderCreated: wo.created || wo.promoted,
  };
}

/**
 * Look up the account owner's user_id. Used by non-session callers (portal).
 * Returns null if no owner is found (shouldn't happen in practice).
 */
export async function getAccountOwnerUserId(
  client: PoolClient,
  accountId: string
): Promise<string | null> {
  const res = await client.query<{ id: string }>(
    `SELECT id FROM users WHERE account_id = $1 AND role = 'owner' LIMIT 1`,
    [accountId]
  );
  return res.rows[0]?.id ?? null;
}
