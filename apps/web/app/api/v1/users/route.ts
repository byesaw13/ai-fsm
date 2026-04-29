import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hash } from "bcryptjs";
import { withRole } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { getPool, query } from "@/lib/db";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const createUserBody = z.object({
  full_name: z.string().min(1).max(255),
  email: z.string().email().max(255),
  phone: z.string().max(50).optional().or(z.literal("")),
  role: z.enum(["owner", "admin", "tech"]),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const GET = withRole(["owner", "admin"], async (_request: NextRequest, session: AuthSession) => {
  const rows = await query(
    `SELECT id, full_name, email, phone, role, created_at
     FROM users
     WHERE account_id = $1
     ORDER BY role, full_name`,
    [session.accountId]
  );
  return NextResponse.json({ data: rows });
});

export const POST = withRole(["owner", "admin"], async (request: NextRequest, session: AuthSession) => {
  const body = await request.json().catch(() => null);
  const parsed = createUserBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: parsed.error.flatten().fieldErrors, traceId: session.traceId } },
      { status: 422 }
    );
  }

  // Only owners can create other owners or admins
  if (parsed.data.role !== "tech" && session.role !== "owner") {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Only owners can create admin or owner accounts", traceId: session.traceId } },
      { status: 403 }
    );
  }

  const { full_name, email, phone, role, password } = parsed.data;
  const password_hash = await hash(password, 12);

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

    // Check for duplicate email within account
    const existing = await client.query(
      `SELECT id FROM users WHERE account_id = $1 AND email = $2`,
      [session.accountId, email.toLowerCase().trim()]
    );
    if (existing.rowCount && existing.rowCount > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: { code: "CONFLICT", message: "A user with that email already exists", traceId: session.traceId } },
        { status: 409 }
      );
    }

    const { rows } = await client.query(
      `INSERT INTO users (account_id, full_name, email, phone, role, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, full_name, email, phone, role, created_at`,
      [session.accountId, full_name, email.toLowerCase().trim(), phone || null, role, password_hash]
    );
    const newUser = rows[0];

    await appendAuditLog(client, {
      account_id: session.accountId,
      entity_type: "user",
      entity_id: newUser.id as string,
      action: "insert",
      actor_id: session.userId,
      trace_id: session.traceId,
      old_value: null,
      new_value: { full_name, email, phone: phone || null, role },
    });

    await client.query("COMMIT");
    return NextResponse.json({ data: newUser }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("POST /api/v1/users error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to create user", traceId: session.traceId } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});
