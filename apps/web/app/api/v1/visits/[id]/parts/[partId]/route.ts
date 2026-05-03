/**
 * PATCH  /api/v1/visits/[id]/parts/[partId] — update a part
 * DELETE /api/v1/visits/[id]/parts/[partId] — remove a part
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { PoolClient } from "pg";
import { withAuth } from "../../../../../../../lib/auth/middleware";
import type { AuthSession } from "../../../../../../../lib/auth/middleware";
import { queryOne, getPool } from "../../../../../../../lib/db";
import { logger } from "../../../../../../../lib/logger";

export const dynamic = "force-dynamic";

const patchPartBody = z.object({
  name: z.string().min(1).optional(),
  quantity: z.number().positive().optional(),
  actual_cost_cents: z.number().int().nonnegative().optional(),
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

export const PATCH = withAuth(
  async (request: NextRequest, session: AuthSession) => {
    const visitId = request.url.match(/\/visits\/([^/]+)\/parts/)?.[1];
    const partId = request.url.match(/\/parts\/([^/]+)(?:\/|$)/)?.[1];

    if (!visitId || !partId) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Part not found", traceId: session.traceId } },
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
    const parsed = patchPartBody.safeParse(body);
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
        `SELECT set_config('app.current_user_id', $1, true),
                set_config('app.current_account_id', $2, true),
                set_config('app.current_role', $3, true)`,
        [session.userId, session.accountId, session.role]
      );

      // Fetch current values to recalculate price if cost changes
      const existing = await client.query<{ actual_cost_cents: number; quantity: number }>(
        `SELECT actual_cost_cents, quantity FROM visit_parts WHERE id = $1 AND visit_id = $2 AND account_id = $3`,
        [partId, visitId, session.accountId]
      );
      if (!existing.rows[0]) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Part not found", traceId: session.traceId } },
          { status: 404 }
        );
      }

      const newActualCost = parsed.data.actual_cost_cents ?? existing.rows[0].actual_cost_cents;
      const newCustomerPrice = Math.ceil(newActualCost * 1.15);

      const fields: string[] = ["customer_price_cents = $4"];
      const values: unknown[] = [partId, visitId, session.accountId, newCustomerPrice];
      let idx = 5;

      if (parsed.data.name !== undefined) { fields.push(`name = $${idx++}`); values.push(parsed.data.name); }
      if (parsed.data.quantity !== undefined) { fields.push(`quantity = $${idx++}`); values.push(parsed.data.quantity); }
      if (parsed.data.actual_cost_cents !== undefined) { fields.push(`actual_cost_cents = $${idx++}`); values.push(parsed.data.actual_cost_cents); }
      if (parsed.data.receipt_media_id !== undefined) { fields.push(`receipt_media_id = $${idx++}`); values.push(parsed.data.receipt_media_id); }

      const { rows } = await client.query(
        `UPDATE visit_parts SET ${fields.join(", ")}, updated_at = now()
         WHERE id = $1 AND visit_id = $2 AND account_id = $3
         RETURNING id, name, quantity, actual_cost_cents, customer_price_cents, receipt_media_id, updated_at`,
        values
      );

      await recalcJobCost(client, visitId, session.accountId);
      await client.query("COMMIT");
      return NextResponse.json({ data: rows[0] });
    } catch (err) {
      await client.query("ROLLBACK");
      logger.error("[parts PATCH]", err, { traceId: session.traceId });
      return NextResponse.json(
        { error: { code: "INTERNAL_ERROR", message: "Failed to update part", traceId: session.traceId } },
        { status: 500 }
      );
    } finally {
      client.release();
    }
  }
);

export const DELETE = withAuth(
  async (request: NextRequest, session: AuthSession) => {
    const visitId = request.url.match(/\/visits\/([^/]+)\/parts/)?.[1];
    const partId = request.url.match(/\/parts\/([^/]+)(?:\/|$)/)?.[1];

    if (!visitId || !partId) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Part not found", traceId: session.traceId } },
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
        `DELETE FROM visit_parts WHERE id = $1 AND visit_id = $2 AND account_id = $3 RETURNING id`,
        [partId, visitId, session.accountId]
      );

      if (!rows[0]) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Part not found", traceId: session.traceId } },
          { status: 404 }
        );
      }

      await recalcJobCost(client, visitId, session.accountId);
      await client.query("COMMIT");
      return NextResponse.json({ data: { deleted: true } });
    } catch (err) {
      await client.query("ROLLBACK");
      logger.error("[parts DELETE]", err, { traceId: session.traceId });
      return NextResponse.json(
        { error: { code: "INTERNAL_ERROR", message: "Failed to delete part", traceId: session.traceId } },
        { status: 500 }
      );
    } finally {
      client.release();
    }
  }
);
