import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, withRole } from "../../../../../../lib/auth/middleware";
import type { AuthSession } from "../../../../../../lib/auth/middleware";
import { query, getPool } from "../../../../../../lib/db";
import { appendAuditLog } from "../../../../../../lib/db/audit";
import { logger } from "../../../../../../lib/logger";

export const dynamic = "force-dynamic";

const createVisitBody = z.object({
  assigned_user_id: z.string().uuid().optional(),
  scheduled_start: z.string().datetime(),
  scheduled_end: z.string().datetime(),
  tech_notes: z.string().optional(),
});

export const GET = withAuth(
  async (request: NextRequest, session: AuthSession) => {
    // Extract [id] from URL — HOF wrappers don't forward route params
    const jobId = request.url.match(/\/jobs\/([^/]+)\/visits/)?.[1];

    if (!jobId) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Job not found", traceId: session.traceId } },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 200);
    const offset = parseInt(searchParams.get("offset") ?? "0");

    // RLS automatically scopes tech to assigned visits — no extra filter needed
    const visits = await query(
      `SELECT * FROM visits WHERE job_id = $1 AND account_id = $2 ORDER BY scheduled_start ASC LIMIT $3 OFFSET $4`,
      [jobId, session.accountId, limit, offset]
    );

    return NextResponse.json({ data: visits, limit, offset });
  }
);

export const POST = withRole(
  ["owner", "admin"],
  async (request: NextRequest, session: AuthSession) => {
    const jobId = request.url.match(/\/jobs\/([^/]+)\/visits/)?.[1];

    if (!jobId) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Job not found", traceId: session.traceId } },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = createVisitBody.safeParse(body);

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

    const { assigned_user_id, scheduled_start, scheduled_end, tech_notes } = parsed.data;

    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(
        `SET LOCAL app.current_user_id = $1; SET LOCAL app.current_account_id = $2; SET LOCAL app.current_role = $3`,
        [session.userId, session.accountId, session.role]
      );

      const { rows } = await client.query(
        `INSERT INTO visits (account_id, job_id, assigned_user_id, scheduled_start, scheduled_end, tech_notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          session.accountId,
          jobId,
          assigned_user_id ?? null,
          scheduled_start,
          scheduled_end,
          tech_notes ?? null,
        ]
      );

      const visit = rows[0];

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "visit",
        entity_id: visit.id,
        action: "insert",
        actor_id: session.userId,
        trace_id: session.traceId,
        new_value: visit,
      });

      await client.query("COMMIT");
      return NextResponse.json({ data: visit }, { status: 201 });
    } catch (err) {
      await client.query("ROLLBACK");
      logger.error("[visits POST]", err, { traceId: session.traceId });
      return NextResponse.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to create visit",
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
