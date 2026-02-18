import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, withRole } from "../../../../lib/auth/middleware";
import type { AuthSession } from "../../../../lib/auth/middleware";
import { query, getPool } from "../../../../lib/db";
import { appendAuditLog } from "../../../../lib/db/audit";

export const dynamic = "force-dynamic";

const createJobBody = z.object({
  client_id: z.string().uuid(),
  property_id: z.string().uuid().optional(),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  priority: z.number().int().min(0).optional().default(0),
  scheduled_start: z.string().datetime().optional(),
  scheduled_end: z.string().datetime().optional(),
});

export const GET = withAuth(
  async (request: NextRequest, session: AuthSession) => {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 200);
    const offset = parseInt(searchParams.get("offset") ?? "0");

    const jobs = await query(
      `SELECT * FROM jobs WHERE account_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [session.accountId, limit, offset]
    );

    return NextResponse.json({ data: jobs, limit, offset });
  }
);

export const POST = withRole(
  ["owner", "admin"],
  async (request: NextRequest, session: AuthSession) => {
    const body = await request.json().catch(() => null);
    const parsed = createJobBody.safeParse(body);

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

    const { client_id, property_id, title, description, priority, scheduled_start, scheduled_end } =
      parsed.data;

    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(
        `SET LOCAL app.current_user_id = $1; SET LOCAL app.current_account_id = $2; SET LOCAL app.current_role = $3`,
        [session.userId, session.accountId, session.role]
      );

      const { rows } = await client.query(
        `INSERT INTO jobs (account_id, client_id, property_id, title, description, priority, scheduled_start, scheduled_end, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          session.accountId,
          client_id,
          property_id ?? null,
          title,
          description ?? null,
          priority,
          scheduled_start ?? null,
          scheduled_end ?? null,
          session.userId,
        ]
      );

      const job = rows[0];

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "job",
        entity_id: job.id,
        action: "insert",
        actor_id: session.userId,
        trace_id: session.traceId,
        new_value: job,
      });

      await client.query("COMMIT");
      return NextResponse.json({ data: job }, { status: 201 });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("[jobs POST]", err);
      return NextResponse.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to create job",
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
