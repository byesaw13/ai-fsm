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
        const { rows: visitRows } = await client.query<{
          id: string;
          assigned_user_id: string | null;
          visit_type: string;
          job_type: string | null;
        }>(
          `SELECT v.id, v.assigned_user_id, v.visit_type, j.job_type
             FROM visits v
             JOIN jobs   j ON j.id = v.job_id AND j.account_id = v.account_id
            WHERE v.id = $1 AND v.account_id = $2`,
          [id, session.accountId]
        );

        if (!visitRows[0]) {
          return null;
        }

        if (session.role === "tech" && visitRows[0].assigned_user_id !== session.userId) {
          return null;
        }

        return getOrSeedChecklist(
          client,
          session.accountId,
          id,
          visitRows[0].job_type ?? undefined,
          visitRows[0].visit_type ?? undefined
        );
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
