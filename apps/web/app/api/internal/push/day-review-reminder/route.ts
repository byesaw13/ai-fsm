/**
 * POST /api/internal/push/day-review-reminder — evening nudge to close the day.
 *
 * Called by the scheduler (worker cron / HA) so the actual send runs on the
 * egress-capable web tier (the worker has no internet egress). Internal-key
 * protected, mirroring api/internal/arrival-prompt. Pushes each person who still
 * has an open business day for today.
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { logger } from "@/lib/logger";
import { isPushConfigured } from "@/lib/push/vapid";
import { sendPushToUser } from "@/lib/push/send";

export const dynamic = "force-dynamic";

const KEY = process.env.LOCATION_INTERNAL_KEY;

export async function POST(req: NextRequest) {
  if (!KEY || req.headers.get("x-api-key") !== KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isPushConfigured()) {
    return NextResponse.json({ ok: false, reason: "push_not_configured" }, { status: 503 });
  }
  try {
    const { rows } = await getPool().query<{ account_id: string; user_id: string }>(
      `SELECT account_id, user_id FROM business_days
        WHERE closed_at IS NULL
          AND business_date = (now() AT TIME ZONE 'America/New_York')::date
          AND user_id IS NOT NULL`,
    );
    let sent = 0;
    for (const row of rows) {
      sent += await sendPushToUser(row.account_id, row.user_id, {
        title: "Wrap up your day",
        body: "Your workday is still open — review and close it out.",
        url: "/app/day-review",
        tag: "day-review-reminder",
      });
    }
    return NextResponse.json({ ok: true, open_days: rows.length, sent });
  } catch (error) {
    logger.error("POST /api/internal/push/day-review-reminder error", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
