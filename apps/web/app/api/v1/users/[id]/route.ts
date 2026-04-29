import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { getPool, queryOne } from "@/lib/db";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const patchUserBody = z
  .object({
    full_name: z.string().min(1).max(255).optional(),
    email: z.string().email().max(255).optional(),
    phone: z.string().max(50).optional().or(z.literal("")),
    role: z.enum(["owner", "admin", "tech"]).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field is required" });

// Any authenticated user can view/edit — permissions enforced inside handler.
export const GET = withAuth(async (request: NextRequest, session: AuthSession) => {
  const id = request.nextUrl.pathname.split("/").at(-1) ?? "";
  const isSelf = id === session.userId;
  if (!isSelf && session.role !== "owner" && session.role !== "admin") {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Access denied", traceId: session.traceId } },
      { status: 403 }
    );
  }
  const row = await queryOne(
    `SELECT id, full_name, email, phone, role, created_at FROM users WHERE id = $1 AND account_id = $2`,
    [id, session.accountId]
  );
  if (!row) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "User not found", traceId: session.traceId } },
      { status: 404 }
    );
  }
  return NextResponse.json({ data: row });
});

export const PATCH = withAuth(async (request: NextRequest, session: AuthSession) => {
  const id = request.nextUrl.pathname.split("/").at(-1) ?? "";
  const isSelf = id === session.userId;

  if (!isSelf && session.role !== "owner" && session.role !== "admin") {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Access denied", traceId: session.traceId } },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = patchUserBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: parsed.error.flatten().fieldErrors, traceId: session.traceId } },
      { status: 422 }
    );
  }

  const { full_name, email, phone, role } = parsed.data;

  // Role changes: owner only, and can't orphan the last owner
  if (role !== undefined) {
    if (session.role !== "owner") {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Only owners can change roles", traceId: session.traceId } },
        { status: 403 }
      );
    }
    if (role !== "owner" && isSelf) {
      // Check if this would remove the last owner
      const { rows } = await (await getPool().connect()).query(
        `SELECT COUNT(*)::int AS cnt FROM users WHERE account_id = $1 AND role = 'owner'`,
        [session.accountId]
      );
      if ((rows[0]?.cnt ?? 0) <= 1) {
        return NextResponse.json(
          { error: { code: "FORBIDDEN", message: "Cannot remove the last owner", traceId: session.traceId } },
          { status: 422 }
        );
      }
    }
  }

  // Non-admin techs can only edit their own name/phone (not email, not role)
  if (isSelf && session.role === "tech") {
    if (email !== undefined || role !== undefined) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Techs can only update their name and phone", traceId: session.traceId } },
        { status: 403 }
      );
    }
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

    const before = await client.query(
      `SELECT id, full_name, email, phone, role FROM users WHERE id = $1 AND account_id = $2`,
      [id, session.accountId]
    );
    if (!before.rowCount) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "User not found", traceId: session.traceId } }, { status: 404 });
    }

    const setClauses: string[] = ["updated_at = now()"];
    const params: unknown[] = [];
    let idx = 1;

    if (full_name !== undefined) { setClauses.push(`full_name = $${idx++}`); params.push(full_name); }
    if (email !== undefined) { setClauses.push(`email = $${idx++}`); params.push(email.toLowerCase().trim()); }
    if (phone !== undefined) { setClauses.push(`phone = $${idx++}`); params.push(phone || null); }
    if (role !== undefined) { setClauses.push(`role = $${idx++}`); params.push(role); }
    params.push(id);

    const { rows } = await client.query(
      `UPDATE users SET ${setClauses.join(", ")} WHERE id = $${idx} AND account_id = $${idx + 1} RETURNING id, full_name, email, phone, role`,
      [...params, session.accountId]
    );

    await appendAuditLog(client, {
      account_id: session.accountId,
      entity_type: "user",
      entity_id: id,
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
    logger.error("PATCH /api/v1/users/[id] error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to update user", traceId: session.traceId } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});

export const DELETE = withAuth(async (request: NextRequest, session: AuthSession) => {
  const id = request.nextUrl.pathname.split("/").at(-1) ?? "";

  if (session.role !== "owner") {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Only owners can remove team members", traceId: session.traceId } },
      { status: 403 }
    );
  }
  if (id === session.userId) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "You cannot remove your own account", traceId: session.traceId } },
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

    const before = await client.query(
      `SELECT id, full_name, email, role FROM users WHERE id = $1 AND account_id = $2`,
      [id, session.accountId]
    );
    if (!before.rowCount) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "User not found", traceId: session.traceId } }, { status: 404 });
    }

    const target = before.rows[0] as { role: string; full_name: string; email: string };
    if (target.role === "owner") {
      const { rows } = await client.query(
        `SELECT COUNT(*)::int AS cnt FROM users WHERE account_id = $1 AND role = 'owner'`,
        [session.accountId]
      );
      if ((rows[0]?.cnt ?? 0) <= 1) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: { code: "FORBIDDEN", message: "Cannot remove the last owner", traceId: session.traceId } },
          { status: 422 }
        );
      }
    }

    await client.query(`DELETE FROM users WHERE id = $1 AND account_id = $2`, [id, session.accountId]);

    await appendAuditLog(client, {
      account_id: session.accountId,
      entity_type: "user",
      entity_id: id,
      action: "delete",
      actor_id: session.userId,
      trace_id: session.traceId,
      old_value: before.rows[0] as Record<string, unknown>,
      new_value: null,
    });

    await client.query("COMMIT");
    return NextResponse.json({ deleted: true });
  } catch (error: unknown) {
    await client.query("ROLLBACK");
    // FK constraint — user has jobs/visits that reference them
    if (typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "23503") {
      return NextResponse.json(
        { error: { code: "CONSTRAINT", message: "This user has associated jobs or visits and cannot be removed", traceId: session.traceId } },
        { status: 422 }
      );
    }
    logger.error("DELETE /api/v1/users/[id] error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to remove user", traceId: session.traceId } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});
