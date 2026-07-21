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
 * Flatten AI area groups into one task list.
 * When the model still returns multiple groups, prefix task labels with the
 * group title so baselines stay readable without minting many work orders.
 */
export function flattenDecompositionTasks(
  groups: Array<{ title: string; scope: string; tasks: Array<{ label: string; required: boolean }> }>,
): {
  title: string;
  scope: string;
  tasks: Array<{ label: string; required: boolean }>;
} {
  if (groups.length === 1) {
    return {
      title: groups[0].title,
      scope: groups[0].scope,
      tasks: groups[0].tasks,
    };
  }
  const tasks = groups.flatMap((g) =>
    g.tasks.map((t) => ({
      label: t.label.toLowerCase().startsWith(g.title.toLowerCase())
        ? t.label
        : `${g.title} — ${t.label}`,
      required: t.required,
    })),
  );
  const scope = groups
    .map((g) => g.scope || g.title)
    .filter(Boolean)
    .join("; ");
  return {
    title: groups[0].title.includes(" / ")
      ? groups[0].title
      : groups.map((g) => g.title).join(" / ").slice(0, 200),
    scope: scope.slice(0, 2000),
    tasks,
  };
}

/**
 * POST /api/v1/estimates/[id]/decompose/apply — replace the estimate's default
 * work order with a single operational packet and first-class tasks.
 * Area groupings from the AI are flattened onto that one work order (product
 * default: one WO per project). Transactional.
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

    const est = await client.query<{
      status: string;
      client_id: string;
      job_id: string | null;
      property_id: string | null;
      job_title: string | null;
    }>(
      `SELECT e.status, e.client_id, e.job_id, e.property_id, j.title AS job_title
         FROM estimates e LEFT JOIN jobs j ON j.id = e.job_id AND j.account_id = e.account_id
        WHERE e.id = $1 AND e.account_id = $2`,
      [estimateId, session.accountId],
    );
    if (est.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Estimate not found", traceId: session.traceId } }, { status: 404 });
    }
    const { status, client_id, job_id, property_id, job_title } = est.rows[0];
    // Workflow invariant: only an accepted estimate becomes production work.
    if (status !== "approved") {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: { code: "INVALID_TRANSITION", message: "Only an approved estimate can be broken down into work orders", traceId: session.traceId } },
        { status: 409 },
      );
    }

    const flat = flattenDecompositionTasks(parsed.data.work_orders);
    const title = (job_title?.trim() || flat.title).slice(0, 200);
    const scope = flat.scope || null;
    // Linked job → ready (shows on project + My Work). No job yet → draft.
    const woStatus = job_id ? "ready" : "draft";

    // Approval already seeded a coarse default work order for this estimate
    // (createJobFromEstimate). Replace any untouched estimate-derived work orders
    // (no visits, no logged time) so the breakdown doesn't leave a second packet.
    await client.query(
      `DELETE FROM work_orders wo
        WHERE wo.account_id = $1 AND wo.source_estimate_id = $2
          AND wo.status IN ('draft','ready')
          AND NOT EXISTS (SELECT 1 FROM visits v WHERE v.work_order_id = wo.id)
          AND NOT EXISTS (SELECT 1 FROM activity_entries a WHERE a.entity_type = 'work_order' AND a.entity_id = wo.id)`,
      [session.accountId, estimateId],
    );

    const criteria = flat.tasks.map((t, i) => ({
      id: `t-${i}`,
      label: t.label,
      required: t.required,
      completed: false,
    }));

    const ins = await client.query<{ id: string }>(
      `INSERT INTO work_orders
         (account_id, client_id, job_id, property_id, title, scope, status, completion_criteria, source_estimate_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)
       RETURNING id`,
      [
        session.accountId,
        client_id,
        job_id,
        property_id,
        title,
        scope,
        woStatus,
        JSON.stringify(criteria),
        estimateId,
        session.userId,
      ],
    );
    const workOrderId = ins.rows[0].id;
    await seedWorkOrderTasksFromCriteria(client, {
      accountId: session.accountId,
      workOrderId,
      criteria,
      source: "ai",
    });

    await client.query("COMMIT");
    return NextResponse.json(
      {
        data: {
          created_work_order_ids: [workOrderId],
          count: 1,
          task_count: flat.tasks.length,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    logger.error("POST /api/v1/estimates/[id]/decompose/apply error", error, { traceId: session.traceId });
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Could not create the work orders", traceId: session.traceId } }, { status: 500 });
  } finally {
    client.release();
  }
});
