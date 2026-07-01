import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";

export const dynamic = "force-dynamic";

const KEY = process.env.LOCATION_INTERNAL_KEY;

export async function POST(req: NextRequest) {
  if (!KEY || req.headers.get("x-api-key") !== KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const row = await queryOne<{
    suppress_weekend_start_prompt: boolean;
    has_open_day: boolean;
  }>(
    `SELECT a.suppress_weekend_start_prompt,
            EXISTS (
              SELECT 1 FROM business_days bd
              WHERE bd.account_id = a.id
                AND bd.business_date = CURRENT_DATE
                AND bd.status NOT IN ('CLOSED','REOPENED')
            ) AS has_open_day
     FROM accounts a
     JOIN users u ON u.account_id = a.id
     WHERE u.role = 'owner'
     ORDER BY u.created_at LIMIT 1`,
  );

  if (!row) return NextResponse.json({ signal: "no_action" });
  if (row.has_open_day) return NextResponse.json({ signal: "already_started" });

  const day = new Date().getDay(); // 0=Sun, 6=Sat
  if ((day === 0 || day === 6) && row.suppress_weekend_start_prompt) {
    return NextResponse.json({ signal: "suppress_weekend" });
  }

  return NextResponse.json({ signal: "start" });
}
