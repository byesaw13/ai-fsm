/**
 * GET /api/v1/visits/[id]/checklist
 *
 * Returns checklist items for the visit, seeding from the default template
 * on first access (idempotent — UNIQUE constraint prevents duplicates).
 *
 * Access: any authenticated user; tech restricted to assigned visit server-side.
 */
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "../../../../../../lib/auth/middleware";
import type { AuthSession } from "../../../../../../lib/auth/middleware";
import { logger } from "../../../../../../lib/logger";
import { withChecklistContext, getOrSeedChecklist } from "../../../../../../lib/visits/checklist";

export const dynamic = "force-dynamic";

export const GET = withAuth(
  async (request: NextRequest, session: AuthSession) => {
    const id = request.url.match(/\/visits\/([^/]+)\/checklist/)?.[1];

    if (!id) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Visit not found", traceId: session.traceId } },
        { status: 404 }
      );
    }

    try {
      const items = await withChecklistContext(session, async (client) => {
        // Verify the visit exists and belongs to this account.
        // Tech users may only access their assigned visits.
        const { rows: visitRows } = await client.query(
          `SELECT id, assigned_user_id FROM visits WHERE id = $1 AND account_id = $2`,
          [id, session.accountId]
        );

        if (!visitRows[0]) {
          return null;
        }

        if (session.role === "tech" && visitRows[0].assigned_user_id !== session.userId) {
          return null;
        }

        return getOrSeedChecklist(client, session.accountId, id);
      });

      if (items === null) {
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Visit not found", traceId: session.traceId } },
          { status: 404 }
        );
      }

      return NextResponse.json({ data: items });
    } catch (err) {
      logger.error("[checklist GET]", err, { traceId: session.traceId });
      return NextResponse.json(
        { error: { code: "INTERNAL_ERROR", message: "Failed to load checklist", traceId: session.traceId } },
        { status: 500 }
      );
    }
  }
);
