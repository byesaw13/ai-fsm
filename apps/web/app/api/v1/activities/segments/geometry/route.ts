import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { queryForSession } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// TASK-026: GPS geometry for the day map — stop pins + drive routes. Stops use
// the segment coordinate; drive routes use the location_events breadcrumb within
// the drive's time window (denser thanks to the drive-GPS-point automation).
type SegRow = {
  id: string;
  kind: "stop" | "drive";
  started_at: string;
  ended_at: string | null;
  place_label: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
  vehicle_id: string | null;
  estimated_miles: number | null;
};
type EventPt = { occurred_at: string; latitude: number; longitude: number };

export const GET = withAuth(async (request: NextRequest, session) => {
  try {
    const dateParam = request.nextUrl.searchParams.get("date");
    const day = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : null;

    const segs = await queryForSession<SegRow>(
      session,
      `SELECT id, kind, started_at::text, ended_at::text, place_label, latitude, longitude,
              status, vehicle_id,
              ROUND((distance_meters / 1609.344)::numeric, 1)::float8 AS estimated_miles
       FROM location_segments
       WHERE account_id = $1 AND segment_date = COALESCE($2::date, CURRENT_DATE) AND status <> 'dismissed'
       ORDER BY started_at ASC`,
      [session.accountId, day],
    );

    // Load the breadcrumb across the actual span of the day's segments (by time,
    // not by date) so a drive that crosses midnight still gets its later points.
    let pts: EventPt[] = [];
    if (segs.length > 0) {
      const starts = segs.map((s) => s.started_at);
      const ends = segs.map((s) => s.ended_at ?? new Date().toISOString());
      const minStart = starts.reduce((a, b) => (a < b ? a : b));
      const maxEnd = ends.reduce((a, b) => (a > b ? a : b));
      pts = await queryForSession<EventPt>(
        session,
        `SELECT occurred_at::text, latitude, longitude
         FROM location_events
         WHERE account_id = $1 AND latitude IS NOT NULL AND longitude IS NOT NULL
           AND occurred_at >= $2::timestamptz AND occurred_at <= $3::timestamptz
         ORDER BY occurred_at ASC`,
        [session.accountId, minStart, maxEnd],
      );
    }

    const stops = segs
      .filter((s) => s.kind === "stop" && s.latitude != null && s.longitude != null)
      .map((s) => ({ id: s.id, label: s.place_label, lat: s.latitude, lng: s.longitude, status: s.status }));

    const drives = segs
      .filter((s) => s.kind === "drive")
      .map((s) => {
        const end = s.ended_at ?? new Date().toISOString();
        const within = pts
          .filter((p) => p.occurred_at >= s.started_at && p.occurred_at <= end)
          .map((p) => [p.latitude, p.longitude] as [number, number]);
        // Fall back to the segment's own start point if the breadcrumb is sparse.
        const points =
          within.length >= 1
            ? within
            : s.latitude != null && s.longitude != null
              ? [[s.latitude, s.longitude] as [number, number]]
              : [];
        return {
          id: s.id,
          vehicle_id: s.vehicle_id,
          status: s.status,
          estimated_miles: s.estimated_miles,
          points,
        };
      })
      .filter((d) => d.points.length >= 1);

    return NextResponse.json({ data: { stops, drives } });
  } catch (error) {
    logger.error("GET /api/v1/activities/segments/geometry error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to load map data", traceId: session.traceId } },
      { status: 500 },
    );
  }
});
