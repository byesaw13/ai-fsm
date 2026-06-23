import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthSession } from "@/lib/auth/middleware";
import { queryForSession } from "@/lib/db";
import { canViewReports } from "@/lib/auth/permissions";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// EPIC-007: pending detected visits for owner review. Owner/admin only — these
// are account-wide records, like the activity ledger.

type CandidateRow = {
  id: string;
  status: string;
  confidence_score: number;
  distance_meters: number | null;
  arrival_time: string;
  departure_time: string;
  duration_minutes: number;
  classification: string | null;
  property_id: string | null;
  property_address: string | null;
  client_id: string | null;
  client_name: string | null;
  job_id: string | null;
  visit_id: string | null;
};

export const GET = withAuth(async (request: NextRequest, session: AuthSession) => {
  if (!canViewReports(session.role)) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Not permitted", traceId: session.traceId } },
      { status: 403 },
    );
  }
  try {
    const dateParam = request.nextUrl.searchParams.get("date");
    const day = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : null;
    const rows = await queryForSession<CandidateRow>(
      session,
      `SELECT vc.id, vc.status, vc.confidence_score, vc.distance_meters,
              vc.arrival_time::text, vc.departure_time::text, vc.duration_minutes,
              vc.classification, vc.property_id, p.address AS property_address,
              vc.matched_client_id AS client_id, c.name AS client_name,
              vc.job_id, vc.visit_id
       FROM visit_candidates vc
       LEFT JOIN properties p ON p.id = vc.property_id
       LEFT JOIN clients c ON c.id = vc.matched_client_id
       WHERE vc.account_id = $1
         AND vc.status = 'pending'
         AND vc.arrival_time::date = COALESCE($2::date, CURRENT_DATE)
       ORDER BY vc.arrival_time ASC`,
      [session.accountId, day],
    );
    return NextResponse.json({ data: { candidates: rows } });
  } catch (error) {
    logger.error("GET /api/v1/visit-candidates error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to load visit candidates", traceId: session.traceId } },
      { status: 500 },
    );
  }
});
