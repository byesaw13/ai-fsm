import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthSession } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import {
  loadSelectableTasksForJob,
  loadVisitPlannedTasks,
  markTaskPartialWithRemainder,
  setVisitPlannedTasks,
} from "@/lib/work-orders/job-tasks";
import { applyTaskCompletionToggles, mirrorTasksToCompletionCriteria } from "@/lib/work-orders/task-time";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/visits/[id]/tasks
 * ?selectable=1 — also returns incomplete tasks available to plan on this day.
 */
export const GET = withAuth(async (request: NextRequest, session: AuthSession) => {
  const visitId = request.url.match(/\/visits\/([^/]+)\/tasks/)?.[1];
  if (!visitId) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Visit not found", traceId: session.traceId } },
      { status: 404 },
    );
  }
  const wantSelectable = new URL(request.url).searchParams.get("selectable") === "1";

  const client = await getPool().connect();
  try {
    await client.query(
      `SELECT set_config('app.current_user_id',$1,true), set_config('app.current_account_id',$2,true), set_config('app.current_role',$3,true)`,
      [session.userId, session.accountId, session.role],
    );
    const visit = await client.query<{ job_id: string; work_order_id: string | null }>(
      `SELECT job_id, work_order_id FROM visits WHERE id = $1 AND account_id = $2`,
      [visitId, session.accountId],
    );
    if (visit.rowCount === 0) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Visit not found", traceId: session.traceId } },
        { status: 404 },
      );
    }
    const tasks = await loadVisitPlannedTasks(client, visitId, session.accountId);
    const selectable = wantSelectable
      ? await loadSelectableTasksForJob(
          client,
          visit.rows[0].job_id,
          session.accountId,
          visit.rows[0].work_order_id,
        )
      : undefined;
    return NextResponse.json({ data: { tasks, selectable } });
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
 * PUT /api/v1/visits/[id]/tasks — replace planned tasks for this day
 * (including past visits). Done tasks are rejected.
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

const patchBody = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("done"),
    task_id: z.string().uuid(),
  }),
  z.object({
    action: z.literal("partial"),
    task_id: z.string().uuid(),
    /** What is left to do — becomes a new task. */
    remainder_label: z.string().min(2).max(300),
    note: z.string().max(1000).optional(),
  }),
  // Legacy toggle (completed true only — cannot uncheck done via this path)
  z.object({
    action: z.literal("complete").optional(),
    task_id: z.string().uuid(),
    completed: z.boolean(),
  }),
]);

/**
 * PATCH /api/v1/visits/[id]/tasks
 * - action=done: mark complete (locked afterward)
 * - action=partial: started not finished; prompt remainder → new task
 * - completed=true legacy: same as done; completed=false is rejected if already done
 */
export const PATCH = withAuth(async (request: NextRequest, session: AuthSession) => {
  const visitId = request.url.match(/\/visits\/([^/]+)\/tasks/)?.[1];
  if (!visitId) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Visit not found", traceId: session.traceId } },
      { status: 404 },
    );
  }
  const body = await request.json().catch(() => null);
  // Support legacy { task_id, completed } without action
  const normalized =
    body && typeof body === "object" && !("action" in body) && "completed" in body
      ? { ...body, action: body.completed ? "done" : "reopen" }
      : body;
  const parsed = z
    .union([
      patchBody,
      z.object({ action: z.literal("reopen"), task_id: z.string().uuid() }),
    ])
    .safeParse(normalized);
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

    const data = parsed.data as {
      action?: string;
      task_id: string;
      completed?: boolean;
      remainder_label?: string;
      note?: string;
    };

    const link = await client.query<{ work_order_id: string; completed: boolean; status: string }>(
      `SELECT t.work_order_id, t.completed, t.status
         FROM visit_tasks vt
         JOIN work_order_tasks t ON t.id = vt.task_id
        WHERE vt.visit_id = $1 AND vt.account_id = $2 AND vt.task_id = $3`,
      [visitId, session.accountId, data.task_id],
    );
    if (link.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Task is not planned on this day", traceId: session.traceId } },
        { status: 404 },
      );
    }

    const workOrderId = link.rows[0].work_order_id;
    const alreadyDone = link.rows[0].completed || link.rows[0].status === "done";
    const action =
      data.action === "done" || data.completed === true
        ? "done"
        : data.action === "partial"
          ? "partial"
          : data.action === "reopen" || data.completed === false
            ? "reopen"
            : "done";

    if (alreadyDone && action !== "done") {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          error: {
            code: "PRECONDITION_FAILED",
            message: "This task is done and cannot be changed. Work remaining lives on any follow-up task that was created.",
            traceId: session.traceId,
          },
        },
        { status: 422 },
      );
    }

    let remainderId: string | null = null;

    if (action === "done") {
      await applyTaskCompletionToggles(client, {
        workOrderId,
        accountId: session.accountId,
        toggles: [{ id: data.task_id, completed: true }],
      });
      await client.query(
        `UPDATE work_order_tasks SET status = 'done', updated_at = now()
          WHERE id = $1 AND account_id = $2`,
        [data.task_id, session.accountId],
      );
      await mirrorTasksToCompletionCriteria(client, workOrderId, session.accountId);
    } else if (action === "partial") {
      const result = await markTaskPartialWithRemainder(client, {
        accountId: session.accountId,
        workOrderId,
        taskId: data.task_id,
        remainderLabel: data.remainder_label ?? "",
        note: data.note ?? null,
      });
      remainderId = result.remainderId;
      // Auto-plan the remainder on this same day so it shows up for the rest of the day
      await client.query(
        `INSERT INTO visit_tasks (account_id, visit_id, task_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (visit_id, task_id) DO NOTHING`,
        [session.accountId, visitId, remainderId],
      );
    } else {
      // reopen only if not locked done
      await applyTaskCompletionToggles(client, {
        workOrderId,
        accountId: session.accountId,
        toggles: [{ id: data.task_id, completed: false }],
      });
      await client.query(
        `UPDATE work_order_tasks SET status = 'open', updated_at = now()
          WHERE id = $1 AND account_id = $2 AND status <> 'done'`,
        [data.task_id, session.accountId],
      );
      await mirrorTasksToCompletionCriteria(client, workOrderId, session.accountId);
    }

    const tasks = await loadVisitPlannedTasks(client, visitId, session.accountId);
    await client.query("COMMIT");
    return NextResponse.json({ data: { tasks, remainder_task_id: remainderId } });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    logger.error("PATCH visit tasks", err, { traceId: session.traceId });
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: err instanceof Error ? err.message : "Could not update task",
          traceId: session.traceId,
        },
      },
      { status: 422 },
    );
  } finally {
    client.release();
  }
});
