import { NextRequest, NextResponse } from "next/server";
import { withRole } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// DELETE /api/v1/mileage/[id] — owner only
export const DELETE = withRole(["owner", "admin"], async (request: NextRequest, session: AuthSession) => {
  const id = request.nextUrl.pathname.split("/").at(-1)!;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true), set_config('app.current_account_id', $2, true), set_config('app.current_role', $3, true)`,
      [session.userId, session.accountId, session.role]
    );

    const existing = await client.query(
      `SELECT id, miles, purpose, trip_date FROM mileage_logs WHERE id = $1 AND account_id = $2`,
      [id, session.accountId]
    );

    if (existing.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Mileage log not found", traceId: session.traceId } },
        { status: 404 }
      );
    }

    await client.query(`DELETE FROM mileage_logs WHERE id = $1 AND account_id = $2`, [id, session.accountId]);

    await appendAuditLog(client, {
      account_id: session.accountId,
      entity_type: "mileage_log",
      entity_id: id,
      action: "delete",
      actor_id: session.userId,
      trace_id: session.traceId,
      old_value: existing.rows[0],
    });

    await client.query("COMMIT");
    return NextResponse.json({ deleted: true });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("DELETE /api/v1/mileage/[id] error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to delete mileage log", traceId: session.traceId } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});
