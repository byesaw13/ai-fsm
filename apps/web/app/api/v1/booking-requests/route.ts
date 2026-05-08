import { NextRequest, NextResponse } from "next/server";
import { withRole } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const VALID_STATUSES = ["pending", "needs_info", "duplicate", "reviewed", "converted", "cancelled"];

export const GET = withRole(["owner", "admin"], async (request: NextRequest, session) => {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true),
              set_config('app.current_account_id', $2, true),
              set_config('app.current_role', $3, true)`,
      [session.userId, session.accountId, session.role]
    );

    const conditions: string[] = ["br.account_id = $1"];
    const params: unknown[] = [session.accountId];
    let idx = 2;

    if (status && VALID_STATUSES.includes(status)) {
      conditions.push(`br.status = $${idx++}`);
      params.push(status);
    }

    params.push(limit);
    const rows = await client.query(
      `SELECT br.id, br.status, br.name, br.email, br.phone,
              br.service_category, br.service_description,
              br.preferred_date, br.preferred_time_slot,
              br.address, br.city, br.state, br.zip,
              br.review_notes, br.reviewed_at,
              br.job_id, br.visit_id, br.client_id,
              br.created_at,
              u.full_name AS reviewed_by_name
       FROM booking_requests br
       LEFT JOIN users u ON u.id = br.reviewed_by
       WHERE ${conditions.join(" AND ")}
       ORDER BY br.created_at DESC
       LIMIT $${idx}`,
      params
    );

    return NextResponse.json({ data: rows.rows });
  } catch (err) {
    logger.error("GET /api/v1/booking-requests error", err, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to list booking requests", traceId: session.traceId } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});
