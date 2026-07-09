import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import { logger } from "@ai-fsm/log/web";
import { loadEstimateNotStartedReminder } from "@/lib/field/estimate-reminders";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (_request, session) => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true), set_config('app.current_account_id', $2, true), set_config('app.current_role', $3, true)`,
      [session.userId, session.accountId, session.role],
    );
    const reminder = await loadEstimateNotStartedReminder(client, session.accountId, session.userId);
    return NextResponse.json({ data: reminder });
  } catch (error) {
    logger.error("GET /api/v1/field/estimate-reminders error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to load reminders", traceId: session.traceId } },
      { status: 500 },
    );
  } finally {
    client.release();
  }
});