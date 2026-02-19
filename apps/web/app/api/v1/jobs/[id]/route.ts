import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, withRole } from "../../../../../lib/auth/middleware";
import type { AuthSession } from "../../../../../lib/auth/middleware";
import { queryOne, getPool } from "../../../../../lib/db";
import { appendAuditLog } from "../../../../../lib/db/audit";
import { logger } from "../../../../../lib/logger";

export const dynamic = "force-dynamic";

const updateJobBody = z.object({
  client_id: z.string().uuid().optional(),
  property_id: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  priority: z.number().int().min(0).optional(),
  scheduled_start: z.string().datetime().nullable().optional(),
  scheduled_end: z.string().datetime().nullable().optional(),
});

export const GET = withAuth(
  async (request: NextRequest, session: AuthSession) => {
    // Extract [id] from URL since HOF wrappers don't forward route params
    const id = request.url.match(/\/jobs\/([^/]+)/)?.[1];

    if (!id) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Job not found", traceId: session.traceId } },
        { status: 404 }
      );
    }

    const job = await queryOne(
      `SELECT * FROM jobs WHERE id = $1 AND account_id = $2`,
      [id, session.accountId]
    );

    if (!job) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Job not found", traceId: session.traceId } },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: job });
  }
);

export const PATCH = withRole(
  ["owner", "admin"],
  async (request: NextRequest, session: AuthSession) => {
    const id = request.url.match(/\/jobs\/([^/]+)/)?.[1];

    if (!id) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Job not found", traceId: session.traceId } },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = updateJobBody.safeParse(body);

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

    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(
        `SET LOCAL app.current_user_id = $1; SET LOCAL app.current_account_id = $2; SET LOCAL app.current_role = $3`,
        [session.userId, session.accountId, session.role]
      );

      const existing = await client.query(
        `SELECT * FROM jobs WHERE id = $1 AND account_id = $2 FOR UPDATE`,
        [id, session.accountId]
      );

      if (!existing.rows[0]) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Job not found", traceId: session.traceId } },
          { status: 404 }
        );
      }

      const old = existing.rows[0];
      const fields: string[] = [];
      const values: unknown[] = [];
      let idx = 3;

      for (const [key, val] of Object.entries(parsed.data)) {
        if (val !== undefined) {
          fields.push(`${key} = $${idx++}`);
          values.push(val);
        }
      }

      if (fields.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ data: old });
      }

      const { rows } = await client.query(
        `UPDATE jobs SET ${fields.join(", ")}, updated_at = now() WHERE id = $1 AND account_id = $2 RETURNING *`,
        [id, session.accountId, ...values]
      );

      const updated = rows[0];

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "job",
        entity_id: id,
        action: "update",
        actor_id: session.userId,
        trace_id: session.traceId,
        old_value: old,
        new_value: updated,
      });

      await client.query("COMMIT");
      return NextResponse.json({ data: updated });
    } catch (err) {
      await client.query("ROLLBACK");
      logger.error("[jobs PATCH]", err, { traceId: session.traceId });
      return NextResponse.json(
        { error: { code: "INTERNAL_ERROR", message: "Failed to update job", traceId: session.traceId } },
        { status: 500 }
      );
    } finally {
      client.release();
    }
  }
);

export const DELETE = withRole(
  ["owner"],
  async (request: NextRequest, session: AuthSession) => {
    const id = request.url.match(/\/jobs\/([^/]+)/)?.[1];

    if (!id) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Job not found", traceId: session.traceId } },
        { status: 404 }
      );
    }

    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(
        `SET LOCAL app.current_user_id = $1; SET LOCAL app.current_account_id = $2; SET LOCAL app.current_role = $3`,
        [session.userId, session.accountId, session.role]
      );

      const existing = await client.query(
        `SELECT * FROM jobs WHERE id = $1 AND account_id = $2 FOR UPDATE`,
        [id, session.accountId]
      );

      if (!existing.rows[0]) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Job not found", traceId: session.traceId } },
          { status: 404 }
        );
      }

      const job = existing.rows[0];

      if (job.status !== "draft") {
        await client.query("ROLLBACK");
        return NextResponse.json(
          {
            error: {
              code: "CONFLICT",
              message: `Only draft jobs can be deleted (current status: ${job.status})`,
              traceId: session.traceId,
            },
          },
          { status: 409 }
        );
      }

      await client.query(`DELETE FROM jobs WHERE id = $1 AND account_id = $2`, [id, session.accountId]);

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "job",
        entity_id: id,
        action: "delete",
        actor_id: session.userId,
        trace_id: session.traceId,
        old_value: job,
      });

      await client.query("COMMIT");
      return new NextResponse(null, { status: 204 });
    } catch (err) {
      await client.query("ROLLBACK");
      logger.error("[jobs DELETE]", err, { traceId: session.traceId });
      return NextResponse.json(
        { error: { code: "INTERNAL_ERROR", message: "Failed to delete job", traceId: session.traceId } },
        { status: 500 }
      );
    } finally {
      client.release();
    }
  }
);
