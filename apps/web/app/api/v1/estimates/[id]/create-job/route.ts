import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/middleware";
import { appendAuditLog } from "@/lib/db/audit";
import { withEstimateContext } from "@/lib/estimates/db";
import { resolveActionItems } from "@/lib/action-items";
import { deriveJobTitle, deriveJobDescription } from "@/lib/estimates/job-from-estimate";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/estimates/[id]/create-job
 *
 * Create a job from an approved estimate that has no linked job, completing the
 * Estimate → Job → Visit workflow. Pre-fills client, property, title, and scope
 * from the estimate and links the estimate to the new job.
 *
 * Business rules:
 * - Estimate must be `approved`.
 * - Idempotent: if the estimate already has a linked job, that job is returned
 *   and no new job is created (prevents duplicates).
 * - The estimate→job link is permitted on a terminal estimate by the narrowed
 *   immutability rule in migration 105.
 * - The `schedule_job` action item raised on approval is resolved.
 */
export const POST = withRole(["owner", "admin"], async (request, session) => {
  const id = request.nextUrl.pathname.split("/").at(-2)!;

  try {
    const result = await withEstimateContext(session, async (client) => {
      // Lock the estimate row to serialize concurrent create-job requests.
      const estRes = await client.query<{
        id: string;
        status: string;
        client_id: string;
        property_id: string | null;
        job_id: string | null;
        notes: string | null;
        total_cents: number;
        job_type: string | null;
        client_name: string | null;
        property_address: string | null;
      }>(
        `SELECT e.id, e.status, e.client_id, e.property_id, e.job_id, e.notes, e.total_cents,
                j.job_type AS job_type,
                c.name AS client_name,
                p.address AS property_address
         FROM estimates e
         LEFT JOIN jobs j ON j.id = e.job_id
         LEFT JOIN clients c ON c.id = e.client_id
         LEFT JOIN properties p ON p.id = e.property_id
         WHERE e.id = $1 AND e.account_id = $2
         FOR UPDATE OF e`,
        [id, session.accountId]
      );

      if (estRes.rowCount === 0) {
        throw Object.assign(new Error("Estimate not found"), { code: "NOT_FOUND" });
      }
      const est = estRes.rows[0];

      if (est.status !== "approved") {
        throw Object.assign(
          new Error(`Only approved estimates can spawn a job (current status: ${est.status})`),
          { code: "INVALID_TRANSITION" }
        );
      }

      // Idempotency: already linked → return the existing job, create nothing.
      if (est.job_id) {
        return { job_id: est.job_id, created: false };
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

      // A job born from an approved estimate is past the quoting stage.
      const jobRes = await client.query<{ id: string }>(
        `INSERT INTO jobs
           (account_id, client_id, property_id, title, description, status, job_type, created_by)
         VALUES ($1, $2, $3, $4, $5, 'quoted', 'custom', $6)
         RETURNING id`,
        [
          session.accountId,
          est.client_id,
          est.property_id,
          title,
          description,
          session.userId,
        ]
      );
      const jobId = jobRes.rows[0].id;

      // Link the estimate to the new job (one-time NULL→value link; allowed by
      // the narrowed terminal-immutability rule).
      await client.query(`UPDATE estimates SET job_id = $1 WHERE id = $2`, [jobId, id]);

      // Resolve the schedule_job action item raised on approval.
      await resolveActionItems(client, {
        accountId: session.accountId,
        entityId: id,
        actionTypes: ["schedule_job"],
        resolvedBy: session.userId,
      });

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "job",
        entity_id: jobId,
        action: "insert",
        actor_id: session.userId,
        trace_id: session.traceId,
        new_value: { source: "estimate_create_job", estimate_id: id, title },
      });

      return { job_id: jobId, created: true };
    });

    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    const err = error as Error & { code?: string };
    if (err.code === "NOT_FOUND") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Estimate not found", traceId: session.traceId } },
        { status: 404 }
      );
    }
    if (err.code === "INVALID_TRANSITION") {
      return NextResponse.json(
        { error: { code: "INVALID_TRANSITION", message: err.message, traceId: session.traceId } },
        { status: 400 }
      );
    }
    logger.error("POST /api/v1/estimates/[id]/create-job error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to create job from estimate", traceId: session.traceId } },
      { status: 500 }
    );
  }
});
