import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/middleware";
import { appendAuditLog } from "@/lib/db/audit";
import { withEstimateContext } from "@/lib/estimates/db";
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
 * - Links to an open job for the same client when one exists.
 * - Refuses to spawn a new project when the client has recent completed/billed
 *   work unless `force_new_project=true` (query or JSON body).
 * - The estimate→job link is permitted on a terminal estimate by the narrowed
 *   immutability rule in migration 105.
 * - The `schedule_job` action item raised on approval is resolved.
 */
export const POST = withRole(["owner", "admin"], async (request, session) => {
  const id = request.nextUrl.pathname.split("/").at(-2)!;

  let forceNewProject =
    request.nextUrl.searchParams.get("force_new_project") === "true" ||
    request.nextUrl.searchParams.get("force") === "true";
  try {
    const body = (await request.json()) as { force_new_project?: boolean; force?: boolean };
    if (body?.force_new_project === true || body?.force === true) forceNewProject = true;
  } catch {
    // empty body is fine
  }

  try {
    const result = await withEstimateContext(session, async (client) => {
      const { jobId, created, linkedExisting } = await createJobFromEstimate({
        client,
        estimateId: id,
        accountId: session.accountId,
        createdBy: session.userId,
        traceId: session.traceId,
        forceNewProject,
      });

      if (created) {
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

      return { job_id: jobId, created, linked_existing: linkedExisting === true };
    });

    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    const err = error as Error & { code?: string; recentWork?: unknown };
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
    if (err.code === "CLIENT_RECENT_WORK") {
      return NextResponse.json(
        {
          error: {
            code: "CLIENT_RECENT_WORK",
            message: err.message,
            recent_work: err.recentWork,
            hint: "Pass force_new_project=true to create another project intentionally.",
            traceId: session.traceId,
          },
        },
        { status: 409 }
      );
    }
    logger.error("POST /api/v1/estimates/[id]/create-job error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to create job from estimate", traceId: session.traceId } },
      { status: 500 }
    );
  }
});
