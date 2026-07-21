import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole, type AuthSession } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import { seedWorkOrderTasksFromCriteria } from "@/lib/work-orders/task-time";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  work_orders: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        scope: z.string().max(2000).default(""),
        tasks: z.array(z.object({ label: z.string().min(1).max(300), required: z.boolean() })).min(1),
      }),
    )
    .min(1),
});

function idFromPath(req: NextRequest): string | undefined {
  return req.nextUrl.pathname.split("/").at(-3); // .../estimates/<id>/decompose/apply
}

/**
 * POST /api/v1/estimates/[id]/decompose/apply — create the reviewed work orders
 * and their first-class tasks. Each work order also stores the checklist as
 * completion_criteria (parity with the manual checklist). Transactional.
 */
export const POST = withRole(["owner", "admin"], async (request: NextRequest, session: AuthSession) => {
  const estimateId = idFromPath(request);
  if (!estimateId) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Estimate not found", traceId: session.traceId } }, { status: 404 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Invalid breakdown", traceId: session.traceId } }, { status: 400 });
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_user_id',$1,true), set_config('app.current_account_id',$2,true), set_config('app.current_role',$3,true)`,
      [session.userId, session.accountId, session.role],
    );

    const est = await client.query<{ client_id: string; job_id: string | null; property_id: string | null }>(
      `SELECT client_id, job_id, property_id FROM estimates WHERE id = $1 AND account_id = $2`,
      [estimateId, session.accountId],
    );
    if (est.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Estimate not found", traceId: session.traceId } }, { status: 404 });
    }
    const { client_id, job_id, property_id } = est.rows[0];
    const created: string[] = [];

    for (const wo of parsed.data.work_orders) {
      const criteria = wo.tasks.map((t, i) => ({ id: `t-${i}`, label: t.label, required: t.required, completed: false }));
      const ins = await client.query<{ id: string }>(
        `INSERT INTO work_orders
           (account_id, client_id, job_id, property_id, title, scope, status, completion_criteria, source_estimate_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,'draft',$7::jsonb,$8,$9)
         RETURNING id`,
        [session.accountId, client_id, job_id, property_id, wo.title, wo.scope || null, JSON.stringify(criteria), estimateId, session.userId],
      );
      const workOrderId = ins.rows[0].id;
      await seedWorkOrderTasksFromCriteria(client, { accountId: session.accountId, workOrderId, criteria, source: "ai" });
      created.push(workOrderId);
    }

    await client.query("COMMIT");
    return NextResponse.json({ data: { created_work_order_ids: created, count: created.length } }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    logger.error("POST /api/v1/estimates/[id]/decompose/apply error", error, { traceId: session.traceId });
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Could not create the work orders", traceId: session.traceId } }, { status: 500 });
  } finally {
    client.release();
  }
});
