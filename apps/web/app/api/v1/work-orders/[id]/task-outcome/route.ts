import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { withDbSession } from "@/lib/db";
import { LINE_OUTCOMES } from "@/lib/invoices/line-outcome";
import { logger } from "@/lib/logger";

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
    const updated = await withDbSession(session, async (client) => {
      const result = await client.query<{ id: string }>(
        `UPDATE work_order_tasks
         SET completion_outcome = $3, updated_at = now()
         WHERE id = $1 AND work_order_id = $2 AND account_id = $4
         RETURNING id`,
        [parsed.data.task_id, workOrderId, parsed.data.completion_outcome, session.accountId],
      );
      return result.rows[0] ?? null;
    });
    if (!updated) {
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
