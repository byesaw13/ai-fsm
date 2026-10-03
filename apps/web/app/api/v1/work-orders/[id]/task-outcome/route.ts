import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { LINE_OUTCOMES } from "@/lib/invoices/line-outcome";
import { logger } from "@/lib/logger";
import { assertAssignedLead, withLeadWorkOrderContext } from "@/lib/work-orders/lead-access";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  task_id: z.string().uuid(),
  completion_outcome: z.enum(LINE_OUTCOMES).nullable(),
});

export const PATCH = withAuth(async (request: NextRequest, session: AuthSession) => {
  const workOrderId = request.url.match(/\/work-orders\/([^/]+)\/task-outcome/)?.[1];
  if (!workOrderId) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Work order not found", traceId: session.traceId } },
      { status: 404 },
    );
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid completion state", traceId: session.traceId } },
      { status: 422 },
    );
  }

  try {
    const updated = await withLeadWorkOrderContext(session, async (client) => {
      let allowed = await assertAssignedLead(client, workOrderId, session.accountId, session.userId);
      if (!allowed && (session.role === "owner" || session.role === "admin")) {
        const owned = await client.query<{ id: string }>(
          `SELECT id FROM work_orders WHERE id = $1 AND account_id = $2`,
          [workOrderId, session.accountId],
        );
        allowed = owned.rows[0] ? { id: owned.rows[0].id, status: "", completion_criteria: null } : null;
      }
      if (!allowed) return { kind: "forbidden" as const };
      const result = await client.query<{ id: string }>(
        `UPDATE work_order_tasks
         SET completion_outcome = $3, updated_at = now()
         WHERE id = $1 AND work_order_id = $2 AND account_id = $4
         RETURNING id`,
        [parsed.data.task_id, workOrderId, parsed.data.completion_outcome, session.accountId],
      );
      const row = result.rows[0];
      if (!row) return { kind: "missing" as const };
      return { kind: "ok" as const, id: row.id };
    });
    if (updated.kind === "forbidden") {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Not assigned to this work order", traceId: session.traceId } },
        { status: 403 },
      );
    }
    if (updated.kind === "missing") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Task not found", traceId: session.traceId } },
        { status: 404 },
      );
    }
    return NextResponse.json({ data: { id: updated.id, completion_outcome: parsed.data.completion_outcome } });
  } catch (error) {
    logger.error("PATCH task outcome", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Could not save the completion state", traceId: session.traceId } },
      { status: 500 },
    );
  }
});
