import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { queryForSession } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

type EventRow = {
  id: string;
  occurred_at: string;
  kind: string;
  zone: string | null;
  latitude: number | null;
  longitude: number | null;
  geocoded_address: string | null;
  detected_activity: string | null;
  external_id: string | null;
  raw: unknown;
};

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
  vehicle_id: string | null;
  vehicle_session_id: string | null;
  estimated_miles: number | null;
};

function confidenceForSegment(seg: SegmentRow): { level: "high" | "medium" | "low"; reasons: string[] } {
  const reasons: string[] = [];
  if (seg.kind === "drive") {
    if (seg.vehicle_id) reasons.push("vehicle matched");
    if (seg.estimated_miles != null) reasons.push("distance estimated");
    return { level: seg.vehicle_id || seg.estimated_miles != null ? "high" : "medium", reasons };
  }

  if (seg.zone) reasons.push("HA zone matched");
  if (seg.place_label) reasons.push("has readable label");
  if (seg.latitude != null && seg.longitude != null) reasons.push("has coordinates");
  if (seg.ended_at) {
    const minutes = Math.round((new Date(seg.ended_at).getTime() - new Date(seg.started_at).getTime()) / 60000);
    if (minutes >= 5) reasons.push(`stop lasted ${minutes} min`);
    if (minutes > 0 && minutes < 3) reasons.push(`brief ${minutes} min stop`);
  } else {
    reasons.push("currently open");
  }

  const score =
    (seg.zone ? 2 : 0) +
    (seg.place_label ? 1 : 0) +
    (seg.latitude != null && seg.longitude != null ? 1 : 0) +
    (seg.ended_at ? 1 : 0);

  return {
    level: score >= 4 ? "high" : score >= 2 ? "medium" : "low",
    reasons,
  };
}

/**
 * GET /api/v1/activities/location-debug[?date=YYYY-MM-DD]
 *
 * Human-readable troubleshooting surface for the HA -> FSM location bridge:
 * raw HA events beside the derived stop/drive segments for the selected day.
 */
export const GET = withAuth(async (request: NextRequest, session) => {
  try {
    const dateParam = request.nextUrl.searchParams.get("date");
    const day = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : null;

    const segments = await queryForSession<SegmentRow>(
      session,
      `SELECT id, kind, started_at::text, ended_at::text, place_label, zone,
              latitude, longitude, suggested_activity_type, status,
              activity_entry_id, vehicle_id, vehicle_session_id,
              ROUND((distance_meters / 1609.344)::numeric, 1)::float8 AS estimated_miles
       FROM location_segments
       WHERE account_id = $1 AND segment_date = COALESCE($2::date, CURRENT_DATE)
       ORDER BY started_at ASC`,
      [session.accountId, day],
    );

    const events = await queryForSession<EventRow>(
      session,
      `SELECT id, occurred_at::text, kind, zone, latitude, longitude,
              geocoded_address, detected_activity, external_id, raw
       FROM location_events
       WHERE account_id = $1
         AND occurred_at >= COALESCE($2::date, CURRENT_DATE)::timestamptz
         AND occurred_at < (COALESCE($2::date, CURRENT_DATE)::date + INTERVAL '1 day')::timestamptz
       ORDER BY occurred_at ASC`,
      [session.accountId, day],
    );

    return NextResponse.json({
      data: {
        events,
        segments: segments.map((segment) => ({
          ...segment,
          confidence: confidenceForSegment(segment),
        })),
      },
    });
  } catch (error) {
    logger.error("GET /api/v1/activities/location-debug error", error, { traceId: session.traceId });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to load location debug data",
          traceId: session.traceId,
        },
      },
      { status: 500 },
    );
  }
});
