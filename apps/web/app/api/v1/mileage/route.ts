import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { query } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (request: NextRequest, session: AuthSession) => {
  const month = request.nextUrl.searchParams.get("month");

  try {
    const conditions: string[] = ["s.account_id = $1"];
    const params: unknown[] = [session.accountId];
    let idx = 2;

    if (month && /^\d{4}-\d{2}$/.test(month)) {
      conditions.push(`to_char(s.session_date, 'YYYY-MM') = $${idx++}`);
      params.push(month);
    }

    const rows = await query(
      `SELECT s.id,
              s.session_date AS trip_date,
              COALESCE(s.miles, s.end_odometer - s.start_odometer) AS miles,
              s.start_odometer, s.end_odometer,
              s.vehicle_id,
              v.nickname AS vehicle_nickname, v.plate AS vehicle_plate,
              s.notes,
              s.created_by, s.created_at::text,
              u.full_name AS created_by_name
       FROM vehicle_sessions s
       LEFT JOIN vehicles v ON v.id = s.vehicle_id
       LEFT JOIN users u    ON u.id = s.created_by
       WHERE ${conditions.join(" AND ")}
       ORDER BY s.session_date DESC, s.created_at DESC
       LIMIT 200`,
      params
    );

    return NextResponse.json({ data: rows });
  } catch (error) {
    logger.error("GET /api/v1/mileage error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch mileage logs", traceId: session.traceId } },
      { status: 500 }
    );
  }
});
