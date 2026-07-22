import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "../../../../../../lib/auth/middleware";
import type { AuthSession } from "../../../../../../lib/auth/middleware";
import { assertAssignedLead, withLeadWorkOrderContext } from "../../../../../../lib/work-orders/lead-access";
import { validateWorkOrderCompletion } from "../../../../../../lib/work-orders/validate";
import { loadWorkOrderCompletionCriteria } from "../../../../../../lib/work-orders/task-time";
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

    try {
      const result = await withLeadWorkOrderContext(session, async (client) => {
        const wo = await assertAssignedLead(client, id, session.accountId, session.userId);
        if (!wo) {
          return { kind: "forbidden" as const };
        }
        if (wo.status === "completed") {
          return { kind: "ok" as const, status: "completed" as const };
        }

        const active = await client.query(
          `SELECT 1 FROM visits
           WHERE work_order_id = $1 AND account_id = $2
             AND status = ANY($3::text[]) LIMIT 1`,
          [id, session.accountId, ACTIVE_VISIT],
        );
        if (active.rowCount) {
          return { kind: "active_visit" as const };
        }

        const criteria = await loadWorkOrderCompletionCriteria(
          client,
          id,
          session.accountId,
          wo.completion_criteria,
        );
        const gateErr = await validateWorkOrderCompletion(client, id, session.accountId, criteria);
        if (gateErr) {
          return { kind: "gate" as const, message: gateErr };
        }

        await client.query(
          `UPDATE work_orders SET status = 'completed', completed_at = COALESCE(completed_at, now()), updated_at = now()
           WHERE id = $1 AND account_id = $2`,
          [id, session.accountId],
        );
        return { kind: "ok" as const, status: "completed" as const };
      });

      if (result.kind === "forbidden") {
        return NextResponse.json(
          { error: { code: "FORBIDDEN", message: "Only the assigned lead can complete this work order", traceId: session.traceId } },
          { status: 403 },
        );
      }
      if (result.kind === "active_visit") {
        return NextResponse.json(
          { error: { code: "PRECONDITION_FAILED", message: "End the active visit before completing this work order", traceId: session.traceId } },
          { status: 422 },
        );
      }
      if (result.kind === "gate") {
        return NextResponse.json(
          { error: { code: "PRECONDITION_FAILED", message: result.message, traceId: session.traceId } },
          { status: 422 },
        );
      }
      return NextResponse.json({ data: { status: result.status } });
    } catch (err) {
      logger.error("[work-orders complete]", err, { traceId: session.traceId });
      return NextResponse.json(
        { error: { code: "INTERNAL_ERROR", message: "Failed to complete work order", traceId: session.traceId } },
        { status: 500 },
      );
    }
  },
);