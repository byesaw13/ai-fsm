import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hash, compare } from "bcryptjs";
import { withAuth } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { getPool, queryOne } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const changePasswordBody = z.object({
  current_password: z.string().optional(),
  new_password: z.string().min(8, "Password must be at least 8 characters"),
});

export const POST = withAuth(async (request: NextRequest, session: AuthSession) => {
  const id = request.nextUrl.pathname.split("/").at(-2) ?? "";
  const isSelf = id === session.userId;

  if (!isSelf && session.role !== "owner") {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Access denied", traceId: session.traceId } },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = changePasswordBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: parsed.error.flatten().fieldErrors, traceId: session.traceId } },
      { status: 422 }
    );
  }

  const { current_password, new_password } = parsed.data;

  // Changing own password requires current_password
  if (isSelf && !current_password) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Current password is required", traceId: session.traceId } },
      { status: 422 }
    );
  }

  const user = await queryOne<{ id: string; password_hash: string }>(
    `SELECT id, password_hash FROM users WHERE id = $1 AND account_id = $2`,
    [id, session.accountId]
  );
  if (!user) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "User not found", traceId: session.traceId } },
      { status: 404 }
    );
  }

  if (isSelf && current_password) {
    const valid = await compare(current_password, user.password_hash);
    if (!valid) {
      return NextResponse.json(
        { error: { code: "INVALID_CREDENTIALS", message: "Current password is incorrect", traceId: session.traceId } },
        { status: 401 }
      );
    }
  }

  const new_hash = await hash(new_password, 12);

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2 AND account_id = $3`,
      [new_hash, id, session.accountId]
    );
    return NextResponse.json({ updated: true });
  } catch (error) {
    logger.error("POST /api/v1/users/[id]/password error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to update password", traceId: session.traceId } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});
