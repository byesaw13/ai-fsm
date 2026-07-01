import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "../../../../../../lib/auth/middleware";
import type { AuthSession } from "../../../../../../lib/auth/middleware";
import { getPool } from "../../../../../../lib/db";
import { assertAssignedLead } from "../../../../../../lib/work-orders/lead-access";
import { logger } from "../../../../../../lib/logger";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  completion_criteria: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      required: z.boolean(),
      completed: z.boolean(),
    }),
  ),
});

export const PATCH = withAuth(
  async (request: NextRequest, session: AuthSession) => {
    const id = request.url.match(/\/work-orders\/([^/]+)\/completion-criteria/)?.[1];
    if (!id) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Work order not found", traceId: session.traceId } },
        { status: 404 },
      );
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Invalid body", traceId: session.traceId } },
        { status: 422 },
      );
    }

    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const wo = await assertAssignedLead(client, id, session.accountId, session.userId);
      if (!wo) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: { code: "FORBIDDEN", message: "Not assigned to this work order", traceId: session.traceId } },
          { status: 403 },
        );
      }
      if (wo.status === "completed" || wo.status === "cancelled") {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: { code: "PRECONDITION_FAILED", message: "Work order is closed", traceId: session.traceId } },
          { status: 422 },
        );
      }

      await client.query(
        `UPDATE work_orders SET completion_criteria = $3::jsonb, updated_at = now()
         WHERE id = $1 AND account_id = $2`,
        [id, session.accountId, JSON.stringify(parsed.data.completion_criteria)],
      );
      await client.query("COMMIT");
      return NextResponse.json({ data: { completion_criteria: parsed.data.completion_criteria } });
    } catch (err) {
      await client.query("ROLLBACK");
      logger.error("[work-orders completion-criteria]", err, { traceId: session.traceId });
      return NextResponse.json(
        { error: { code: "INTERNAL_ERROR", message: "Failed to update checklist", traceId: session.traceId } },
        { status: 500 },
      );
    } finally {
      client.release();
    }
  },
);