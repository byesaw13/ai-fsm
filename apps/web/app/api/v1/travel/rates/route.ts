import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  rate_cents: z.number().int().min(0).max(10000),
  effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  source: z.enum(["irs", "custom", "business"]).default("custom"),
  description: z.string().max(500).nullable().optional(),
  is_active: z.boolean().default(true),
  /** When true (default), deactivate other active rates. */
  make_exclusive_active: z.boolean().default(true),
});

export const GET = withRole(["owner", "admin"], async (_req: NextRequest, session: AuthSession) => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true),
              set_config('app.current_account_id', $2, true),
              set_config('app.current_role', $3, true)`,
      [session.userId, session.accountId, session.role]
    );
    const r = await client.query(
      `SELECT id, rate_cents, effective_date::text, source, description, is_active, created_at
       FROM mileage_rates
       WHERE account_id = $1
       ORDER BY effective_date DESC, created_at DESC
       LIMIT 50`,
      [session.accountId]
    );
    return NextResponse.json({ data: r.rows });
  } catch (error) {
    logger.error("GET /api/v1/travel/rates", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to list mileage rates", traceId: session.traceId } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});

export const POST = withRole(["owner", "admin"], async (request: NextRequest, session: AuthSession) => {
  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid mileage rate",
          details: parsed.error.flatten().fieldErrors,
          traceId: session.traceId,
        },
      },
      { status: 422 }
    );
  }

  const data = parsed.data;
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

    if (data.is_active && data.make_exclusive_active) {
      await client.query(
        `UPDATE mileage_rates SET is_active = false, updated_at = now()
         WHERE account_id = $1 AND is_active = true`,
        [session.accountId]
      );
    }

    const r = await client.query(
      `INSERT INTO mileage_rates
         (account_id, rate_cents, effective_date, source, description, is_active, created_by)
       VALUES ($1, $2, COALESCE($3::date, CURRENT_DATE), $4, $5, $6, $7)
       RETURNING id, rate_cents, effective_date::text, source, description, is_active, created_at`,
      [
        session.accountId,
        data.rate_cents,
        data.effective_date ?? null,
        data.source,
        data.description ?? null,
        data.is_active,
        session.userId,
      ]
    );

    // Keep settings default in sync with active rate for display
    if (data.is_active) {
      await client.query(
        `UPDATE business_travel_settings
         SET default_mileage_rate_cents = $1, updated_at = now()
         WHERE account_id = $2`,
        [data.rate_cents, session.accountId]
      );
    }

    await appendAuditLog(client, {
      account_id: session.accountId,
      entity_type: "account",
      entity_id: session.accountId,
      action: "insert",
      actor_id: session.userId,
      trace_id: session.traceId,
      new_value: { mileage_rate: r.rows[0] as Record<string, unknown> },
    });

    await client.query("COMMIT");
    return NextResponse.json({ data: r.rows[0] }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("POST /api/v1/travel/rates", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to create mileage rate", traceId: session.traceId } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});
