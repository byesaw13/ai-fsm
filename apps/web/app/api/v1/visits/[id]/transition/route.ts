import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "../../../../../../lib/auth/middleware";
import type { AuthSession } from "../../../../../../lib/auth/middleware";
import { getPool } from "../../../../../../lib/db";
import { appendAuditLog } from "../../../../../../lib/db/audit";
import { logger } from "../../../../../../lib/logger";
import { visitTransitions, visitStatusSchema } from "@ai-fsm/domain";
import type { VisitStatus } from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

const transitionBody = z.object({
  status: visitStatusSchema,
  tech_notes: z.string().optional(),
});

export const POST = withAuth(
  async (request: NextRequest, session: AuthSession) => {
    // Extract [id] from URL — HOF wrappers don't forward route params
    const id = request.url.match(/\/visits\/([^/]+)\/transition/)?.[1];

    if (!id) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Visit not found", traceId: session.traceId } },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = transitionBody.safeParse(body);

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

    const targetStatus = parsed.data.status as VisitStatus;
    const techNotes = parsed.data.tech_notes;

    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(
        `SET LOCAL app.current_user_id = $1; SET LOCAL app.current_account_id = $2; SET LOCAL app.current_role = $3`,
        [session.userId, session.accountId, session.role]
      );

      const existing = await client.query(
        `SELECT * FROM visits WHERE id = $1 AND account_id = $2 FOR UPDATE`,
        [id, session.accountId]
      );

      if (!existing.rows[0]) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Visit not found", traceId: session.traceId } },
          { status: 404 }
        );
      }

      const visit = existing.rows[0];
      const currentStatus = visit.status as VisitStatus;
      const allowed = visitTransitions[currentStatus];

      if (!allowed.includes(targetStatus)) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          {
            error: {
              code: "INVALID_TRANSITION",
              message: `Cannot transition visit from '${currentStatus}' to '${targetStatus}'`,
              traceId: session.traceId,
            },
          },
          { status: 422 }
        );
      }

      // Guard: transitioning to 'arrived' requires an assigned tech
      if (targetStatus === "arrived" && !visit.assigned_user_id) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          {
            error: {
              code: "PRECONDITION_FAILED",
              message: "Visit must have an assigned tech before transitioning to arrived",
              traceId: session.traceId,
            },
          },
          { status: 422 }
        );
      }

      // Build UPDATE — include tech_notes if provided
      const noteClause = techNotes !== undefined ? ", tech_notes = $4" : "";
      const params: unknown[] = [targetStatus, id, session.accountId];
      if (techNotes !== undefined) params.push(techNotes);

      const { rows } = await client.query(
        `UPDATE visits SET status = $1, updated_at = now()${noteClause} WHERE id = $2 AND account_id = $3 RETURNING *`,
        params
      );

      const updated = rows[0];

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "visit",
        entity_id: id,
        action: "update",
        actor_id: session.userId,
        trace_id: session.traceId,
        old_value: { status: currentStatus },
        new_value: { status: targetStatus },
      });

      await client.query("COMMIT");
      return NextResponse.json({ data: updated });
    } catch (err) {
      await client.query("ROLLBACK");
      logger.error("[visits transition POST]", err, { traceId: session.traceId });
      return NextResponse.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to transition visit",
            traceId: session.traceId,
          },
        },
        { status: 500 }
      );
    } finally {
      client.release();
    }
  }
);
