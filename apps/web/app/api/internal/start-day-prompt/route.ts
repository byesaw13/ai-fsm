import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { businessToday } from "@/lib/operations/business-day";

export const dynamic = "force-dynamic";

const KEY = process.env.LOCATION_INTERNAL_KEY;

export async function POST(req: NextRequest) {
  if (!KEY || req.headers.get("x-api-key") !== KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const row = await queryOne<{
    suppress_weekend_start_prompt: boolean;
    has_open_mileage_today: boolean;
  }>(
    `SELECT a.suppress_weekend_start_prompt,
            EXISTS (
              SELECT 1 FROM vehicle_sessions vs
              WHERE vs.account_id = a.id
                AND vs.session_date = $1::date
                AND vs.end_odometer IS NULL
                AND vs.miles IS NULL
            ) AS has_open_mileage_today
     FROM accounts a
     JOIN users u ON u.account_id = a.id
     WHERE u.role = 'owner'
     ORDER BY u.created_at LIMIT 1`,
    [businessToday()],
  );

  if (!row) return NextResponse.json({ signal: "no_action" });
  // Clock-in opens the business day but does not start mileage tracking — only
  // suppress the RAM prompt once today's mileage session is actually open.
  if (row.has_open_mileage_today) return NextResponse.json({ signal: "already_started" });

  // Weekday of the business-timezone day (noon-UTC on that date avoids any
  // rollover ambiguity), not the server's getDay().
  const day = new Date(businessToday() + "T12:00:00Z").getUTCDay(); // 0=Sun, 6=Sat
  if ((day === 0 || day === 6) && row.suppress_weekend_start_prompt) {
    return NextResponse.json({ signal: "suppress_weekend" });
  }

  return NextResponse.json({ signal: "start" });
}
