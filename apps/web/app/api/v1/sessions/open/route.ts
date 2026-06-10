import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { queryOneForSession } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

type OpenSessionRow = {
  id: string;
  session_date: string;
  vehicle_id: string | null;
  vehicle_nickname: string | null;
  vehicle_plate: string | null;
  start_odometer: number;
  end_odometer: number | null;
  miles: string | null;
  notes: string | null;
  created_at: string;
};

function dateParam(request: NextRequest): string {
  const requested = request.nextUrl.searchParams.get("session_date");
  if (requested && /^\d{4}-\d{2}-\d{2}$/.test(requested)) return requested;
  return new Date().toISOString().slice(0, 10);
}

async function findOpenSession(session: AuthSession, sessionDate: string) {
  // vehicle_sessions has FORCE ROW LEVEL SECURITY, so this must run with the
  // RLS session context set (queryOneForSession) — a plain query returns 0 rows.
  return queryOneForSession<OpenSessionRow>(
    session,
    `SELECT s.id, s.session_date::text, s.vehicle_id, v.nickname AS vehicle_nickname,
            v.plate AS vehicle_plate, s.start_odometer, s.end_odometer,
            s.miles::text AS miles, s.notes, s.created_at::text
     FROM vehicle_sessions s
     LEFT JOIN vehicles v ON v.id = s.vehicle_id
     WHERE s.account_id = $1
       AND s.session_date = $2::date
       AND s.end_odometer IS NULL
       AND s.miles IS NULL
     ORDER BY s.created_at DESC
     LIMIT 1`,
    [session.accountId, sessionDate]
  );
}

export const GET = withAuth(async (request: NextRequest, session: AuthSession) => {
  try {
    const data = await findOpenSession(session, dateParam(request));
    return NextResponse.json({ data: data ?? null });
  } catch (error) {
    logger.error("GET /api/v1/sessions/open error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch open session", traceId: session.traceId } },
      { status: 500 }
    );
  }
});
