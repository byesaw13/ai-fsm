import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "../../../../../../lib/auth/middleware";
import type { AuthSession } from "../../../../../../lib/auth/middleware";
import { getPool } from "../../../../../../lib/db";
import type { CompletionCriterion } from "@ai-fsm/domain";
import { assertAssignedLead } from "../../../../../../lib/work-orders/lead-access";
import { validateWorkOrderCompletion } from "../../../../../../lib/work-orders/validate";
import { logger } from "../../../../../../lib/logger";

export const dynamic = "force-dynamic";

const ACTIVE_VISIT = ["dispatched", "traveling", "arrived", "in_progress", "waiting"];

export const POST = withAuth(
  async (request: NextRequest, session: AuthSession) => {
    const id = request.url.match(/\/work-orders\/([^/]+)\/complete/)?.[1];
    if (!id) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Work order not found", traceId: session.traceId } },
        { status: 404 },
      );
    }

    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const wo = await assertAssignedLead(client, id, session.accountId, session.userId);
      if (!wo) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: { code: "FORBIDDEN", message: "Only the assigned lead can complete this work order", traceId: session.traceId } },
          { status: 403 },
        );
      }
      if (wo.status === "completed") {
        await client.query("COMMIT");
        return NextResponse.json({ data: { status: "completed" } });
      }

      const active = await client.query(
        `SELECT 1 FROM visits
         WHERE work_order_id = $1 AND account_id = $2
           AND status = ANY($3::text[]) LIMIT 1`,
        [id, session.accountId, ACTIVE_VISIT],
      );
      if (active.rowCount) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: { code: "PRECONDITION_FAILED", message: "End the active visit before completing this work order", traceId: session.traceId } },
          { status: 422 },
        );
      }

      const criteria = Array.isArray(wo.completion_criteria)
        ? (wo.completion_criteria as CompletionCriterion[])
        : [];
      const gateErr = await validateWorkOrderCompletion(client, id, session.accountId, criteria);
      if (gateErr) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: { code: "PRECONDITION_FAILED", message: gateErr, traceId: session.traceId } },
          { status: 422 },
        );
      }

      await client.query(
        `UPDATE work_orders SET status = 'completed', completed_at = COALESCE(completed_at, now()), updated_at = now()
         WHERE id = $1 AND account_id = $2`,
        [id, session.accountId],
      );
      await client.query("COMMIT");
      return NextResponse.json({ data: { status: "completed" } });
    } catch (err) {
      await client.query("ROLLBACK");
      logger.error("[work-orders complete]", err, { traceId: session.traceId });
      return NextResponse.json(
        { error: { code: "INTERNAL_ERROR", message: "Failed to complete work order", traceId: session.traceId } },
        { status: 500 },
      );
    } finally {
      client.release();
    }
  },
);