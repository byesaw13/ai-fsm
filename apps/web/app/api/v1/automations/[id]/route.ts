import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { queryOne, getPool } from "@/lib/db";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@/lib/logger";
import { getPathId } from "@/lib/route-utils";

export const dynamic = "force-dynamic";

const patchAutomationSchema = z.object({
  enabled: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
});

// PATCH /api/v1/automations/[id] — toggle enabled or update config
export const PATCH = withRole(["owner", "admin"], async (request: NextRequest, session: AuthSession) => {
  const id = getPathId(request.nextUrl.pathname);

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid JSON body", traceId: session.traceId } },
      { status: 400 }
    );
  }

  const parsed = patchAutomationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: parsed.error.flatten().fieldErrors, traceId: session.traceId } },
      { status: 400 }
    );
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true), set_config('app.current_account_id', $2, true), set_config('app.current_role', $3, true)`,
      [session.userId, session.accountId, session.role]
    );

    const existing = await queryOne<{ id: string; enabled: boolean; config: Record<string, unknown> }>(
      `SELECT id, enabled, config FROM automations WHERE id = $1 AND account_id = $2`,
      [id, session.accountId]
    );

    if (!existing) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Automation not found", traceId: session.traceId } },
        { status: 404 }
      );
    }

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (parsed.data.enabled !== undefined) {
      setClauses.push(`enabled = $${idx++}`);
      params.push(parsed.data.enabled);
    }
    if (parsed.data.config !== undefined) {
      setClauses.push(`config = $${idx++}`);
      params.push(JSON.stringify(parsed.data.config));
    }

    if (setClauses.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ data: existing });
    }

    setClauses.push(`updated_at = now()`);
    params.push(id, session.accountId);

    const { rows } = await client.query(
      `UPDATE automations SET ${setClauses.join(", ")} WHERE id = $${idx++} AND account_id = $${idx++} RETURNING id, enabled, config`,
      params
    );

    await appendAuditLog(client, {
      account_id: session.accountId,
      entity_type: "automation",
      entity_id: id,
      action: "update",
      actor_id: session.userId,
      trace_id: session.traceId,
      old_value: { enabled: existing.enabled },
      new_value: parsed.data,
    });

    await client.query("COMMIT");
    return NextResponse.json({ data: rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("PATCH /api/v1/automations/[id] error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to update automation", traceId: session.traceId } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});
