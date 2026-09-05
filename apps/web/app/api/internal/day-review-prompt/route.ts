import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { businessToday, businessMinutesNow } from "@/lib/operations/business-day";
import { sendPushToOwners } from "@/lib/push/send";

export const dynamic = "force-dynamic";

const KEY = process.env.LOCATION_INTERNAL_KEY;

export async function POST(req: NextRequest) {
  if (!KEY || req.headers.get("x-api-key") !== KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const row = await queryOne<{
    account_id: string;
    business_day_id: string | null;
    cutoff_time: string;
    already_prompted: boolean;
  }>(
    `SELECT a.id AS account_id,
            bd.id AS business_day_id,
            a.day_review_cutoff_time::text AS cutoff_time,
            (bd.review_prompted_at IS NOT NULL) AS already_prompted
     FROM accounts a
     JOIN users u ON u.account_id = a.id
     LEFT JOIN business_days bd
       ON bd.account_id = a.id
       AND bd.business_date = $1::date
       AND bd.status NOT IN ('CLOSED')
     WHERE u.role = 'owner'
     ORDER BY u.created_at LIMIT 1`,
    [businessToday()],
  );

  if (!row?.business_day_id) {
    return NextResponse.json({ result: "skipped", reason: "no_open_day" });
  }
  if (row.already_prompted) {
    return NextResponse.json({ result: "skipped", reason: "already_prompted" });
  }

  // cutoff_time is "HH:MM:SS" from postgres TIME cast — compare against the
  // business-timezone clock, not the server's (UTC in prod) getHours().
  const [cutoffHour, cutoffMin] = row.cutoff_time.split(":").map(Number);
  if (businessMinutesNow() < cutoffHour * 60 + cutoffMin) {
    return NextResponse.json({ result: "skipped", reason: "before_cutoff" });
  }

  await queryOne(
    `UPDATE business_days SET review_prompted_at = now(), updated_at = now() WHERE id = $1`,
    [row.business_day_id],
  );

  await sendPushToOwners(row.account_id, {
    title: "Time to close out your day",
    body: "You're home — review today's visits and close the day.",
    url: "/app/day-review",
    tag: `day-review-${businessToday()}`,
  });

  return NextResponse.json({ result: "prompted" });
}
