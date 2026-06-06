import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/middleware";
import { appendAuditLog } from "@/lib/db/audit";
import { withEstimateContext } from "@/lib/estimates/db";
import { resolveActionItems } from "@/lib/action-items";
import { createJobFromEstimate } from "@/lib/estimates/create-job-db";
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
      const { jobId, created } = await createJobFromEstimate({
        client,
        estimateId: id,
        accountId: session.accountId,
        createdBy: session.userId,
        traceId: session.traceId,
      });

      if (created) {
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
          new_value: { source: "estimate_create_job", estimate_id: id },
        });
      }

      return { job_id: jobId, created };
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
