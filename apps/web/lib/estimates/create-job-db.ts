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

/** How far back to look for completed/billed work that should block a new project. */
export const RECENT_WORK_LOOKBACK_DAYS = 14;

interface CreateJobFromEstimateOptions {
  client: PoolClient;
  estimateId: string;
  accountId: string;
  /** Used as jobs.created_by. For portal-triggered creation, pass the account owner's user_id. */
  createdBy: string;
  traceId?: string;
  /**
   * When true, skip the "client already has recent completed/billed work" guard
   * and create a new project anyway. Explicit create-job UI can pass this after
   * the operator confirms.
   */
  forceNewProject?: boolean;
}

export interface RecentClientWork {
  jobId: string;
  jobTitle: string;
  jobStatus: string;
  jobCompletedAt: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  invoiceStatus: string | null;
  invoiceTotalCents: number | null;
}

interface CreateJobResult {
  jobId: string;
  created: boolean;
  /** True when estimate was linked to an existing open job instead of spawning a new one. */
  linkedExisting?: boolean;
  workOrderId?: string;
  workOrderCreated?: boolean;
  /**
   * Present when auto-create was blocked because the client already has recent
   * completed/billed work. Callers that must not fail approval (portal/email)
   * can treat this as a soft skip; the explicit create-job API should 409.
   */
  blockedByRecentWork?: RecentClientWork[];
}

/**
 * Find recent completed jobs (and their final invoices) for a client that
 * suggest an unlinked estimate should not spawn a second project.
 */
export async function findRecentClientWork(
  client: PoolClient,
  accountId: string,
  clientId: string,
  propertyId: string | null,
  lookbackDays = RECENT_WORK_LOOKBACK_DAYS
): Promise<RecentClientWork[]> {
  const res = await client.query<{
    job_id: string;
    job_title: string;
    job_status: string;
    job_completed_at: string | null;
    invoice_id: string | null;
    invoice_number: string | null;
    invoice_status: string | null;
    invoice_total_cents: number | null;
  }>(
    `SELECT j.id AS job_id,
            j.title AS job_title,
            j.status AS job_status,
            j.updated_at::text AS job_completed_at,
            i.id AS invoice_id,
            i.invoice_number,
            i.status AS invoice_status,
            i.total_cents AS invoice_total_cents
     FROM jobs j
     LEFT JOIN LATERAL (
       SELECT id, invoice_number, status, total_cents
       FROM invoices
       WHERE job_id = j.id
         AND account_id = j.account_id
         AND invoice_kind IN ('final', 'standard')
         AND status IN ('sent', 'partial', 'paid', 'overdue', 'draft')
       ORDER BY
         CASE status
           WHEN 'paid' THEN 0
           WHEN 'partial' THEN 1
           WHEN 'sent' THEN 2
           WHEN 'overdue' THEN 3
           ELSE 4
         END,
         created_at DESC
       LIMIT 1
     ) i ON true
     WHERE j.account_id = $1
       AND j.client_id = $2
       AND j.status IN ('completed', 'invoiced')
       AND j.updated_at >= now() - ($3::text || ' days')::interval
       AND ($4::uuid IS NULL OR j.property_id IS NULL OR j.property_id = $4)
     ORDER BY j.updated_at DESC
     LIMIT 5`,
    [accountId, clientId, String(lookbackDays), propertyId]
  );

  return res.rows.map((r) => ({
    jobId: r.job_id,
    jobTitle: r.job_title,
    jobStatus: r.job_status,
    jobCompletedAt: r.job_completed_at,
    invoiceId: r.invoice_id,
    invoiceNumber: r.invoice_number,
    invoiceStatus: r.invoice_status,
    invoiceTotalCents: r.invoice_total_cents,
  }));
}

/**
 * Prefer linking an unlinked estimate to an existing open job for the same
 * client (and property when set) instead of spawning a parallel project.
 */
async function findOpenJobToLink(
  client: PoolClient,
  accountId: string,
  clientId: string,
  propertyId: string | null
): Promise<string | null> {
  const res = await client.query<{ id: string }>(
    `SELECT j.id
     FROM jobs j
     WHERE j.account_id = $1
       AND j.client_id = $2
       AND j.status IN ('draft', 'quoted', 'scheduled', 'in_progress')
       AND ($3::uuid IS NULL OR j.property_id IS NULL OR j.property_id = $3)
     ORDER BY
       CASE WHEN $3::uuid IS NOT NULL AND j.property_id = $3 THEN 0 ELSE 1 END,
       j.updated_at DESC
     LIMIT 1`,
    [accountId, clientId, propertyId]
  );
  return res.rows[0]?.id ?? null;
}

/**
 * Idempotent: if the estimate already has a linked job, returns it without
 * creating a new one. Caller must hold a FOR UPDATE lock on the estimate row
 * or otherwise ensure serialization.
 *
 * Also:
 * - Links to an open job for the same client when one exists (no new project).
 * - Blocks spawning a new project when the client was recently completed/billed
 *   unless `forceNewProject` is set (throws CLIENT_RECENT_WORK).
 */
export async function createJobFromEstimate({
  client,
  estimateId,
  accountId,
  createdBy,
  forceNewProject = false,
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

  // Prefer linking to an open project for this client rather than forking.
  const openJobId = await findOpenJobToLink(
    client,
    accountId,
    est.client_id,
    est.property_id
  );
  if (openJobId) {
    await client.query(`UPDATE estimates SET job_id = $1 WHERE id = $2`, [
      openJobId,
      estimateId,
    ]);
    const wo = await promoteOrCreateWorkOrderFromEstimate({
      client,
      estimateId,
      jobId: openJobId,
      accountId,
      createdBy,
    });
    return {
      jobId: openJobId,
      created: false,
      linkedExisting: true,
      workOrderId: wo.workOrderId,
      workOrderCreated: wo.created || wo.promoted,
    };
  }

  // Guard: client already has recent completed/billed work — don't silently
  // spawn a second project (Boyd-class double-invoice).
  if (!forceNewProject) {
    const recent = await findRecentClientWork(
      client,
      accountId,
      est.client_id,
      est.property_id
    );
    // Only block when there is a real invoice (draft final still counts —
    // that means visit completion already ran on another job).
    const withInvoice = recent.filter((r) => r.invoiceId != null);
    if (withInvoice.length > 0) {
      throw Object.assign(
        new Error(
          `Client already has recent completed work with an invoice ` +
            `(${withInvoice.map((r) => r.invoiceNumber ?? r.jobTitle).join(", ")}). ` +
            `Link the estimate to that job or pass forceNewProject to create another.`
        ),
        {
          code: "CLIENT_RECENT_WORK",
          recentWork: withInvoice,
        }
      );
    }
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
  await client.query(`UPDATE estimates SET job_id = $1 WHERE id = $2`, [
    jobId,
    estimateId,
  ]);

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
