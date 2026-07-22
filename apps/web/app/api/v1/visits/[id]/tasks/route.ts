import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthSession } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import { loadVisitPlannedTasks, setVisitPlannedTasks } from "@/lib/work-orders/job-tasks";
import { applyTaskCompletionToggles } from "@/lib/work-orders/task-time";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/visits/[id]/tasks — planned tasks for this field day.
 */
export const GET = withAuth(async (request: NextRequest, session: AuthSession) => {
  const visitId = request.url.match(/\/visits\/([^/]+)\/tasks/)?.[1];
  if (!visitId) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Visit not found", traceId: session.traceId } },
      { status: 404 },
    );
  }
  const client = await getPool().connect();
  try {
    await client.query(
      `SELECT set_config('app.current_user_id',$1,true), set_config('app.current_account_id',$2,true), set_config('app.current_role',$3,true)`,
      [session.userId, session.accountId, session.role],
    );
    const visit = await client.query(
      `SELECT id FROM visits WHERE id = $1 AND account_id = $2`,
      [visitId, session.accountId],
    );
    if (visit.rowCount === 0) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Visit not found", traceId: session.traceId } },
        { status: 404 },
      );
    }
    const tasks = await loadVisitPlannedTasks(client, visitId, session.accountId);
    return NextResponse.json({ data: { tasks } });
  } catch (err) {
    logger.error("GET visit tasks", err, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Could not load day tasks", traceId: session.traceId } },
      { status: 500 },
    );
  } finally {
    client.release();
  }
});

const putBody = z.object({
  task_ids: z.array(z.string().uuid()).max(100),
});

/**
 * PUT /api/v1/visits/[id]/tasks — replace planned tasks for this day.
 */
export const PUT = withAuth(async (request: NextRequest, session: AuthSession) => {
  const visitId = request.url.match(/\/visits\/([^/]+)\/tasks/)?.[1];
  if (!visitId) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Visit not found", traceId: session.traceId } },
      { status: 404 },
    );
  }
  const parsed = putBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid body", traceId: session.traceId } },
      { status: 422 },
    );
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_user_id',$1,true), set_config('app.current_account_id',$2,true), set_config('app.current_role',$3,true)`,
      [session.userId, session.accountId, session.role],
    );
    const { rows } = await client.query<{ job_id: string; work_order_id: string | null }>(
      `SELECT job_id, work_order_id FROM visits WHERE id = $1 AND account_id = $2 FOR UPDATE`,
      [visitId, session.accountId],
    );
    if (!rows[0]) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Visit not found", traceId: session.traceId } },
        { status: 404 },
      );
    }
    await setVisitPlannedTasks(client, {
      accountId: session.accountId,
      visitId,
      jobId: rows[0].job_id,
      workOrderId: rows[0].work_order_id,
      taskIds: parsed.data.task_ids,
    });
    const tasks = await loadVisitPlannedTasks(client, visitId, session.accountId);
    await client.query("COMMIT");
    return NextResponse.json({ data: { tasks } });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    logger.error("PUT visit tasks", err, { traceId: session.traceId });
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: err instanceof Error ? err.message : "Could not save day tasks",
          traceId: session.traceId,
        },
      },
      { status: 422 },
    );
  } finally {
    client.release();
  }
});

const patchBody = z.object({
  task_id: z.string().uuid(),
  completed: z.boolean(),
});

/**
 * PATCH /api/v1/visits/[id]/tasks — toggle a planned task complete on the job.
 */
export const PATCH = withAuth(async (request: NextRequest, session: AuthSession) => {
  const visitId = request.url.match(/\/visits\/([^/]+)\/tasks/)?.[1];
  if (!visitId) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Visit not found", traceId: session.traceId } },
      { status: 404 },
    );
  }
  const parsed = patchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid body", traceId: session.traceId } },
      { status: 422 },
    );
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_user_id',$1,true), set_config('app.current_account_id',$2,true), set_config('app.current_role',$3,true)`,
      [session.userId, session.accountId, session.role],
    );

    // Task must be planned on this visit (or allow any job task for owner/admin?).
    const link = await client.query(
      `SELECT vt.task_id, t.work_order_id
         FROM visit_tasks vt
         JOIN work_order_tasks t ON t.id = vt.task_id
        WHERE vt.visit_id = $1 AND vt.account_id = $2 AND vt.task_id = $3`,
      [visitId, session.accountId, parsed.data.task_id],
    );
    if (link.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Task is not planned on this day", traceId: session.traceId } },
        { status: 404 },
      );
    }

    const workOrderId = link.rows[0].work_order_id as string;
    await applyTaskCompletionToggles(client, {
      workOrderId,
      accountId: session.accountId,
      toggles: [{ id: parsed.data.task_id, completed: parsed.data.completed }],
    });
    const tasks = await loadVisitPlannedTasks(client, visitId, session.accountId);
    await client.query("COMMIT");
    return NextResponse.json({ data: { tasks } });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    logger.error("PATCH visit tasks", err, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Could not update task", traceId: session.traceId } },
      { status: 500 },
    );
  } finally {
    client.release();
  }
});
