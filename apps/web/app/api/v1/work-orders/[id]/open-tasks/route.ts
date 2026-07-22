import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthSession } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import { loadOpenTasksForWorkOrder } from "@/lib/work-orders/job-tasks";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/work-orders/[id]/open-tasks — incomplete tasks for day planning.
 */
export const GET = withAuth(async (request: NextRequest, session: AuthSession) => {
  const woId = request.url.match(/\/work-orders\/([^/]+)\/open-tasks/)?.[1];
  if (!woId) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Work order not found", traceId: session.traceId } },
      { status: 404 },
    );
  }

  const client = await getPool().connect();
  try {
    await client.query(
      `SELECT set_config('app.current_user_id',$1,true), set_config('app.current_account_id',$2,true), set_config('app.current_role',$3,true)`,
      [session.userId, session.accountId, session.role],
    );
    const wo = await client.query(
      `SELECT id FROM work_orders WHERE id = $1 AND account_id = $2`,
      [woId, session.accountId],
    );
    if (wo.rowCount === 0) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Work order not found", traceId: session.traceId } },
        { status: 404 },
      );
    }
    const tasks = await loadOpenTasksForWorkOrder(client, woId, session.accountId);
    return NextResponse.json({ data: { tasks } });
  } catch (err) {
    logger.error("GET open-tasks", err, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Could not load tasks", traceId: session.traceId } },
      { status: 500 },
    );
  } finally {
    client.release();
  }
});
