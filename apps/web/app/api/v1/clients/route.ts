import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { getPool, query } from "@/lib/db";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const createClientBody = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(50).optional().or(z.literal("")),
  notes: z.string().max(5000).optional().or(z.literal("")),
});

function validationError(parsed: z.SafeParseError<unknown>, traceId: string) {
  return NextResponse.json(
    {
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request body",
        details: parsed.error.flatten().fieldErrors,
        traceId,
      },
    },
    { status: 422 }
  );
}

export const GET = withRole(["owner", "admin"], async (request: NextRequest, session: AuthSession) => {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "100"), 1), 200);

  const params: unknown[] = [session.accountId];
  const conditions = ["c.account_id = $1"];
  let idx = 2;
  if (q) {
    conditions.push(`(LOWER(c.name) LIKE $${idx} OR LOWER(COALESCE(c.email, '')) LIKE $${idx} OR LOWER(COALESCE(c.phone, '')) LIKE $${idx})`);
    params.push(`%${q}%`);
    idx++;
  }
  params.push(limit);

  const rows = await query(
    `SELECT c.*, 
            COUNT(DISTINCT p.id)::int AS property_count,
            COUNT(DISTINCT j.id)::int AS job_count
     FROM clients c
     LEFT JOIN properties p ON p.client_id = c.id AND p.account_id = c.account_id
     LEFT JOIN jobs j ON j.client_id = c.id AND j.account_id = c.account_id
     WHERE ${conditions.join(" AND ")}
     GROUP BY c.id
     ORDER BY c.name ASC
     LIMIT $${idx}`,
    params
  );

  return NextResponse.json({ data: rows, limit });
});

export const POST = withRole(["owner", "admin"], async (request: NextRequest, session: AuthSession) => {
  const body = await request.json().catch(() => null);
  const parsed = createClientBody.safeParse(body);
  if (!parsed.success) return validationError(parsed, session.traceId);

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SET LOCAL app.current_user_id = $1; SET LOCAL app.current_account_id = $2; SET LOCAL app.current_role = $3`,
      [session.userId, session.accountId, session.role]
    );

    const { name, email, phone, notes } = parsed.data;
    const result = await client.query(
      `INSERT INTO clients (account_id, name, email, phone, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [session.accountId, name.trim(), email || null, phone || null, notes || null]
    );

    const created = result.rows[0];
    await appendAuditLog(client, {
      account_id: session.accountId,
      entity_type: "client",
      entity_id: created.id,
      action: "insert",
      actor_id: session.userId,
      trace_id: session.traceId,
      new_value: created,
    });

    await client.query("COMMIT");
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error("[clients POST]", err, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to create client", traceId: session.traceId } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});
