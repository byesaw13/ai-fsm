/**
 * PATCH /api/v1/visits/[id]/checklist/[itemId]
 *
 * Update disposition and/or note on a single checklist item.
 * Requires at least one of { disposition, note } in the request body.
 *
 * Access: all roles; tech restricted to assigned visit server-side.
 */
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "../../../../../../../lib/auth/middleware";
import type { AuthSession } from "../../../../../../../lib/auth/middleware";
import { logger } from "../../../../../../../lib/logger";
import { updateChecklistItemSchema } from "@ai-fsm/domain";
import {
  withChecklistContext,
  updateChecklistItem,
} from "../../../../../../../lib/visits/checklist";

export const dynamic = "force-dynamic";

export const PATCH = withAuth(
  async (request: NextRequest, session: AuthSession) => {
    const visitMatch = request.url.match(/\/visits\/([^/]+)\/checklist\/([^/]+)/);
    const visitId = visitMatch?.[1];
    const itemId = visitMatch?.[2];

    if (!visitId || !itemId) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Checklist item not found", traceId: session.traceId } },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = updateChecklistItemSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request body",
            details: parsed.error.flatten().fieldErrors,
            traceId: session.traceId,
          },
        },
        { status: 422 }
      );
    }

    try {
      const updated = await withChecklistContext(session, async (client) => {
        // Verify visit exists, belongs to account, and tech authorization.
        const { rows: visitRows } = await client.query(
          `SELECT id, assigned_user_id FROM visits WHERE id = $1 AND account_id = $2`,
          [visitId, session.accountId]
        );

        if (!visitRows[0]) {
          return null as "notfound" | null;
        }

        if (session.role === "tech" && visitRows[0].assigned_user_id !== session.userId) {
          return "forbidden" as "forbidden";
        }

        return updateChecklistItem(
          client,
          session.accountId,
          visitId,
          itemId,
          parsed.data
        );
      });

      if (updated === null || updated === "notfound") {
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Checklist item not found", traceId: session.traceId } },
          { status: 404 }
        );
      }

      if (updated === "forbidden") {
        return NextResponse.json(
          { error: { code: "FORBIDDEN", message: "Access denied", traceId: session.traceId } },
          { status: 403 }
        );
      }

      return NextResponse.json({ data: updated });
    } catch (err) {
      logger.error("[checklist PATCH]", err, { traceId: session.traceId });
      return NextResponse.json(
        { error: { code: "INTERNAL_ERROR", message: "Failed to update checklist item", traceId: session.traceId } },
        { status: 500 }
      );
    }
  }
);
