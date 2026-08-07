/**
 * GET /api/v1/reports/mileage-export?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Owner/admin CSV: hybrid mileage dual path (TASK-091).
 * Primary = odometer/manual vehicle_sessions; GPS = drive segment sum per day.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  buildHybridMileageExportRow,
  hybridMileageExportToCsv,
  type MilesSource,
} from "@ai-fsm/domain";
import { withRole } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { query } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

function isDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export const GET = withRole(["owner", "admin"], async (request: NextRequest, session: AuthSession) => {
  try {
    const { searchParams } = new URL(request.url);
    const from = (searchParams.get("from") ?? "").trim();
    const to = (searchParams.get("to") ?? "").trim();
    const today = new Date().toLocaleDateString("en-CA");
    const fromDate = isDate(from) ? from : today;
    const toDate = isDate(to) ? to : fromDate;

    const sessions = await query<{
      id: string;
      session_date: string;
      vehicle_name: string | null;
      start_odometer: number | null;
      end_odometer: number | null;
      odometer_miles: number | null;
      miles_source: string | null;
    }>(
      `SELECT vs.id,
              vs.session_date::text AS session_date,
              v.nickname AS vehicle_name,
              vs.start_odometer,
              vs.end_odometer,
              COALESCE(vs.miles, (vs.end_odometer - vs.start_odometer)::numeric)::float8 AS odometer_miles,
              vs.miles_source
       FROM vehicle_sessions vs
       LEFT JOIN vehicles v ON v.id = vs.vehicle_id
       WHERE vs.account_id = $1
         AND vs.session_date BETWEEN $2::date AND $3::date
         AND vs.status <> 'voided'
       ORDER BY vs.session_date ASC, vs.started_at ASC NULLS LAST`,
      [session.accountId, fromDate, toDate],
    );

    const gpsByDate = await query<{ session_date: string; meters: number }>(
      `SELECT segment_date::text AS session_date,
              COALESCE(SUM(distance_meters), 0)::float8 AS meters
       FROM location_segments
       WHERE account_id = $1
         AND segment_date BETWEEN $2::date AND $3::date
         AND kind = 'drive'
         AND status <> 'dismissed'
         AND COALESCE(is_likely_noise, false) = false
       GROUP BY segment_date`,
      [session.accountId, fromDate, toDate],
    );
    const gpsMap = new Map(gpsByDate.map((g) => [g.session_date, Number(g.meters) / 1609.34]));

    const rows = sessions.map((s) =>
      buildHybridMileageExportRow({
        date: s.session_date,
        vehicleSessionId: s.id,
        vehicleName: s.vehicle_name,
        startOdometer: s.start_odometer,
        endOdometer: s.end_odometer,
        primaryMiles: s.odometer_miles,
        primarySource: (s.miles_source as MilesSource | null) ?? "odometer",
        gpsMiles: gpsMap.get(s.session_date) ?? 0,
      }),
    );

    const csv = hybridMileageExportToCsv(rows);
    const filename = `mileage-${fromDate}_to_${toDate}.csv`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    logger.error("GET /api/v1/reports/mileage-export error", error, {
      traceId: session.traceId,
    });
    return NextResponse.json({ error: "Failed to export mileage" }, { status: 500 });
  }
});
