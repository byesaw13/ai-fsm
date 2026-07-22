import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "../../../../../../lib/auth/middleware";
import type { AuthSession } from "../../../../../../lib/auth/middleware";
import {
  assertAssignedLead,
  withLeadWorkOrderContext,
} from "../../../../../../lib/work-orders/lead-access";
import {
  applyTaskCompletionToggles,
  loadWorkOrderCompletionCriteria,
} from "../../../../../../lib/work-orders/task-time";
import { logger } from "../../../../../../lib/logger";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  completion_criteria: z.array(
    z.object({
      id: z.string(),
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

    try {
      const result = await withLeadWorkOrderContext(session, async (client) => {
        // Assigned lead, or owner/admin managing the project hub.
        let wo = await assertAssignedLead(client, id, session.accountId, session.userId);
        if (!wo && (session.role === "owner" || session.role === "admin")) {
          const r = await client.query<{ id: string; status: string; completion_criteria: unknown }>(
            `SELECT id, status, completion_criteria FROM work_orders
              WHERE id = $1 AND account_id = $2 FOR UPDATE`,
            [id, session.accountId],
          );
          wo = r.rows[0] ?? null;
        }
        if (!wo) {
          return { kind: "forbidden" as const };
        }
        if (wo.status === "completed" || wo.status === "cancelled") {
          return { kind: "closed" as const };
        }

        // Slice 1b: first-class tasks are the checklist source of truth.
        // Seed from JSONB when a legacy WO has no tasks yet, then apply toggles.
        await loadWorkOrderCompletionCriteria(
          client,
          id,
          session.accountId,
          wo.completion_criteria,
        );

        const criteria = await applyTaskCompletionToggles(client, {
          workOrderId: id,
          accountId: session.accountId,
          toggles: parsed.data.completion_criteria,
        });
        return { kind: "ok" as const, completion_criteria: criteria };
      });

      if (result.kind === "forbidden") {
        return NextResponse.json(
          { error: { code: "FORBIDDEN", message: "Not assigned to this work order", traceId: session.traceId } },
          { status: 403 },
        );
      }
      if (result.kind === "closed") {
        return NextResponse.json(
          { error: { code: "PRECONDITION_FAILED", message: "Work order is closed", traceId: session.traceId } },
          { status: 422 },
        );
      }
      return NextResponse.json({ data: { completion_criteria: result.completion_criteria } });
    } catch (err) {
      logger.error("[work-orders completion-criteria]", err, { traceId: session.traceId });
      return NextResponse.json(
        { error: { code: "INTERNAL_ERROR", message: "Failed to update checklist", traceId: session.traceId } },
        { status: 500 },
      );
    }
  },
);