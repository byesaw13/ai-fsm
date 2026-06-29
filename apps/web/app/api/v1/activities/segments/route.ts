import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { queryForSession } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// TASK-024: today's derived location segments — the labelable day timeline.
type SegmentRow = {
  id: string;
  kind: "stop" | "drive";
  started_at: string;
  ended_at: string | null;
  place_label: string | null;
  zone: string | null;
  latitude: number | null;
  longitude: number | null;
  suggested_activity_type: string | null;
  status: string;
  activity_entry_id: string | null;
  distance_meters: number | null;
  vehicle_id: string | null;
  vehicle_session_id: string | null;
  estimated_miles: number | null;
  is_likely_noise: boolean;
};

/**
 * GET /api/v1/activities/segments — a day's stop/drive segments (oldest first),
 * plus the currently-open one. Dismissed segments are hidden. The day defaults
 * to today; pass ?date=YYYY-MM-DD to match the timeline's day picker.
 */
export const GET = withAuth(async (request: NextRequest, session) => {
  try {
    const dateParam = request.nextUrl.searchParams.get("date");
    const day = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : null;
    const rows = await queryForSession<SegmentRow>(
      session,
      `SELECT id, kind, started_at::text, ended_at::text, place_label, zone,
              latitude, longitude, suggested_activity_type, status, activity_entry_id,
              distance_meters, vehicle_id, vehicle_session_id, is_likely_noise,
              ROUND((distance_meters / 1609.344)::numeric, 1)::float8 AS estimated_miles
       FROM location_segments
       WHERE account_id = $1
         AND segment_date = COALESCE($2::date, CURRENT_DATE)
         AND status <> 'dismissed'
       ORDER BY started_at ASC`,
      [session.accountId, day],
    );
    const open = rows.find((r) => r.ended_at === null) ?? null;
    return NextResponse.json({ data: { segments: rows, open } });
  } catch (error) {
    logger.error("GET /api/v1/activities/segments error", error, { traceId: session.traceId });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to load location segments",
          traceId: session.traceId,
        },
      },
      { status: 500 },
    );
  }
});
