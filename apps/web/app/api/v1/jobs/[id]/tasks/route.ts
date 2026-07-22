import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthSession } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import { loadJobTaskProgress } from "@/lib/work-orders/job-tasks";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/jobs/[id]/tasks — project task list + progress (required done / total).
 */
export const GET = withAuth(async (request: NextRequest, session: AuthSession) => {
  const jobId = request.url.match(/\/jobs\/([^/]+)\/tasks/)?.[1];
  if (!jobId) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Project not found", traceId: session.traceId } },
      { status: 404 },
    );
  }

  const client = await getPool().connect();
  try {
    await client.query(
      `SELECT set_config('app.current_user_id',$1,true), set_config('app.current_account_id',$2,true), set_config('app.current_role',$3,true)`,
      [session.userId, session.accountId, session.role],
    );
    const job = await client.query(`SELECT id FROM jobs WHERE id = $1 AND account_id = $2`, [
      jobId,
      session.accountId,
    ]);
    if (job.rowCount === 0) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Project not found", traceId: session.traceId } },
        { status: 404 },
      );
    }
    const progress = await loadJobTaskProgress(client, jobId, session.accountId);
    return NextResponse.json({ data: progress });
  } catch (err) {
    logger.error("GET /api/v1/jobs/[id]/tasks", err, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Could not load tasks", traceId: session.traceId } },
      { status: 500 },
    );
  } finally {
    client.release();
  }
});
