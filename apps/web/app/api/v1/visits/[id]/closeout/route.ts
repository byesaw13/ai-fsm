import { NextRequest, NextResponse } from "next/server";
import { visitCloseoutBodySchema } from "@ai-fsm/domain";
import { withAuth } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import { logger } from "@/lib/logger";
import { CloseoutError, runVisitCloseout } from "@/lib/visits/closeout";

export const dynamic = "force-dynamic";

export const POST = withAuth(async (request: NextRequest, session: AuthSession) => {
  const id = request.url.match(/\/visits\/([^/]+)\/closeout/)?.[1];
  if (!id) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Visit not found", traceId: session.traceId } },
      { status: 404 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = visitCloseoutBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues[0]?.message ?? "Invalid closeout",
          details: parsed.error.flatten().fieldErrors,
          traceId: session.traceId,
        },
      },
      { status: 422 },
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
      [session.userId, session.accountId, session.role],
    );
    const result = await runVisitCloseout(
      client,
      {
        userId: session.userId,
        accountId: session.accountId,
        role: session.role,
        traceId: session.traceId,
      },
      id,
      parsed.data,
    );
    await client.query("COMMIT");
    return NextResponse.json({ data: result });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err instanceof CloseoutError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message, traceId: session.traceId } },
        { status: err.httpStatus },
      );
    }
    logger.error("[visits closeout POST]", err, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Could not close out visit", traceId: session.traceId } },
      { status: 500 },
    );
  } finally {
    client.release();
  }
});
