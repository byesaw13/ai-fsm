import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "../../../../../../lib/auth/middleware";
import type { AuthSession } from "../../../../../../lib/auth/middleware";
import type { CompletionCriterion } from "@ai-fsm/domain";
import {
  assertAssignedLead,
  mergeCompletionCriteriaToggles,
  withLeadWorkOrderContext,
} from "../../../../../../lib/work-orders/lead-access";
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
        const wo = await assertAssignedLead(client, id, session.accountId, session.userId);
        if (!wo) {
          return { kind: "forbidden" as const };
        }
        if (wo.status === "completed" || wo.status === "cancelled") {
          return { kind: "closed" as const };
        }

        const existing = Array.isArray(wo.completion_criteria)
          ? (wo.completion_criteria as CompletionCriterion[])
          : [];
        const merged = mergeCompletionCriteriaToggles(existing, parsed.data.completion_criteria);
        if ("error" in merged) {
          return { kind: "validation" as const, message: merged.error };
        }

        await client.query(
          `UPDATE work_orders SET completion_criteria = $3::jsonb, updated_at = now()
           WHERE id = $1 AND account_id = $2`,
          [id, session.accountId, JSON.stringify(merged)],
        );
        return { kind: "ok" as const, completion_criteria: merged };
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
      if (result.kind === "validation") {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: result.message, traceId: session.traceId } },
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