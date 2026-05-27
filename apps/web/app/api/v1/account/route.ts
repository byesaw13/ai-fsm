import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { getPool, queryOne } from "@/lib/db";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const patchAccountBody = z
  .object({
    name: z.string().min(1).max(255).optional(),
    settings: z
      .object({
        invoice_terms: z.string().max(2000).optional(),
        estimate_expiry_days: z.number().int().min(1).max(365).optional(),
        labor_rate_cents: z.number().int().min(0).optional(),
        material_markup_pct: z.number().min(0).max(200).optional(),
      })
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field is required" });

export const GET = withRole(["owner", "admin"], async (_request: NextRequest, session: AuthSession) => {
  const row = await queryOne(
    `SELECT id, name, settings, created_at FROM accounts WHERE id = $1`,
    [session.accountId]
  );
  if (!row) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Account not found", traceId: session.traceId } },
      { status: 404 }
    );
  }
  return NextResponse.json({ data: row });
});

export const PATCH = withRole(["owner", "admin"], async (request: NextRequest, session: AuthSession) => {
  const body = await request.json().catch(() => null);
  const parsed = patchAccountBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: parsed.error.flatten().fieldErrors, traceId: session.traceId } },
      { status: 422 }
    );
  }

  const { name, settings } = parsed.data;
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

    const before = await client.query(`SELECT name, settings FROM accounts WHERE id = $1`, [session.accountId]);
    if (!before.rowCount) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Account not found", traceId: session.traceId } }, { status: 404 });
    }

    const setClauses: string[] = ["updated_at = now()"];
    const params: unknown[] = [];
    let idx = 1;

    if (name !== undefined) {
      setClauses.push(`name = $${idx++}`);
      params.push(name);
    }
    if (settings !== undefined) {
      // Merge into existing settings rather than replace
      setClauses.push(`settings = settings || $${idx++}::jsonb`);
      params.push(JSON.stringify(settings));
    }
    params.push(session.accountId);

    const { rows } = await client.query(
      `UPDATE accounts SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING id, name, settings`,
      params
    );

    await appendAuditLog(client, {
      account_id: session.accountId,
      entity_type: "account",
      entity_id: session.accountId,
      action: "update",
      actor_id: session.userId,
      trace_id: session.traceId,
      old_value: before.rows[0] as Record<string, unknown>,
      new_value: rows[0] as Record<string, unknown>,
    });

    await client.query("COMMIT");
    return NextResponse.json({ data: rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("PATCH /api/v1/account error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to update account", traceId: session.traceId } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});
