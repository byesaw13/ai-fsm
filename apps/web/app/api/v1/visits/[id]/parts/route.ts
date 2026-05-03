/**
 * GET  /api/v1/visits/[id]/parts — list parts for a visit
 * POST /api/v1/visits/[id]/parts — add a part
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { PoolClient } from "pg";
import { withAuth } from "../../../../../../lib/auth/middleware";
import type { AuthSession } from "../../../../../../lib/auth/middleware";
import { query, queryOne, getPool } from "../../../../../../lib/db";
import { logger } from "../../../../../../lib/logger";

export const dynamic = "force-dynamic";

const addPartBody = z.object({
  name: z.string().min(1),
  quantity: z.number().positive().default(1),
  actual_cost_cents: z.number().int().nonnegative(),
  receipt_media_id: z.string().uuid().nullable().optional(),
});

async function getVisit(visitId: string, session: AuthSession) {
  return queryOne<{ id: string; assigned_user_id: string | null }>(
    `SELECT id, assigned_user_id FROM visits WHERE id = $1 AND account_id = $2`,
    [visitId, session.accountId]
  );
}

async function recalcJobCost(client: PoolClient, visitId: string, accountId: string) {
  await client.query(
    `UPDATE jobs SET actual_cost_cents = (
       SELECT COALESCE(SUM(ROUND(p.actual_cost_cents * p.quantity)), 0)
       FROM visit_parts p
       JOIN visits v ON v.id = p.visit_id
       WHERE v.job_id = (SELECT job_id FROM visits WHERE id = $1 AND account_id = $2)
         AND p.account_id = $2
     ), updated_at = now()
     WHERE id = (SELECT job_id FROM visits WHERE id = $1 AND account_id = $2)
       AND account_id = $2`,
    [visitId, accountId]
  );
}

export const GET = withAuth(
  async (request: NextRequest, session: AuthSession) => {
    const visitId = request.url.match(/\/visits\/([^/]+)\/parts/)?.[1];
    if (!visitId) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Visit not found", traceId: session.traceId } },
        { status: 404 }
      );
    }

    const visit = await getVisit(visitId, session);
    if (!visit) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Visit not found", traceId: session.traceId } },
        { status: 404 }
      );
    }
    if (session.role === "tech" && visit.assigned_user_id !== session.userId) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Access denied", traceId: session.traceId } },
        { status: 403 }
      );
    }

    const rows = await query(
      `SELECT id, name, quantity, actual_cost_cents, customer_price_cents, receipt_media_id, created_at
       FROM visit_parts
       WHERE visit_id = $1 AND account_id = $2
       ORDER BY created_at`,
      [visitId, session.accountId]
    );

    return NextResponse.json({ data: rows });
  }
);

export const POST = withAuth(
  async (request: NextRequest, session: AuthSession) => {
    const visitId = request.url.match(/\/visits\/([^/]+)\/parts/)?.[1];
    if (!visitId) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Visit not found", traceId: session.traceId } },
        { status: 404 }
      );
    }

    const visit = await getVisit(visitId, session);
    if (!visit) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Visit not found", traceId: session.traceId } },
        { status: 404 }
      );
    }
    if (session.role === "tech" && visit.assigned_user_id !== session.userId) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Access denied", traceId: session.traceId } },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = addPartBody.safeParse(body);
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

    const { name, quantity, actual_cost_cents, receipt_media_id } = parsed.data;
    const customer_price_cents = Math.ceil(actual_cost_cents * 1.15);

    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `SELECT set_config('app.current_user_id', $1, true),
                set_config('app.current_account_id', $2, true),
                set_config('app.current_role', $3, true)`,
        [session.userId, session.accountId, session.role]
      );

      const { rows } = await client.query(
        `INSERT INTO visit_parts (account_id, visit_id, name, quantity, actual_cost_cents, customer_price_cents, receipt_media_id, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, name, quantity, actual_cost_cents, customer_price_cents, receipt_media_id, created_at`,
        [session.accountId, visitId, name, quantity, actual_cost_cents, customer_price_cents, receipt_media_id ?? null, session.userId]
      );

      await recalcJobCost(client, visitId, session.accountId);

      await client.query("COMMIT");
      return NextResponse.json({ data: rows[0] }, { status: 201 });
    } catch (err) {
      await client.query("ROLLBACK");
      logger.error("[parts POST]", err, { traceId: session.traceId });
      return NextResponse.json(
        { error: { code: "INTERNAL_ERROR", message: "Failed to add part", traceId: session.traceId } },
        { status: 500 }
      );
    } finally {
      client.release();
    }
  }
);
