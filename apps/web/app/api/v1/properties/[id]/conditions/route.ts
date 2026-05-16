import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "../../../../../../lib/auth/middleware";
import type { AuthSession } from "../../../../../../lib/auth/middleware";
import { query, queryOne } from "../../../../../../lib/db";

export const dynamic = "force-dynamic";

function propertyId(request: NextRequest) {
  return request.url.match(/\/properties\/([^/]+)\/conditions/)?.[1] ?? null;
}

export const GET = withAuth(async (request: NextRequest, session: AuthSession) => {
  const pid = propertyId(request);
  if (!pid) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Property not found", traceId: session.traceId } },
      { status: 404 }
    );
  }

  const prop = await queryOne(
    `SELECT id FROM properties WHERE id = $1 AND account_id = $2`,
    [pid, session.accountId]
  );
  if (!prop) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Property not found", traceId: session.traceId } },
      { status: 404 }
    );
  }

  // Latest condition per area + trend (last 3 visits per area)
  const current = await query(
    `SELECT DISTINCT ON (area)
       area, condition, note, assessed_at, visit_id
     FROM property_condition_snapshots
     WHERE account_id = $1 AND property_id = $2
     ORDER BY area, assessed_at DESC`,
    [session.accountId, pid]
  );

  const trend = await query(
    `SELECT area, condition, assessed_at, visit_id
     FROM (
       SELECT area, condition, assessed_at, visit_id,
              ROW_NUMBER() OVER (PARTITION BY area ORDER BY assessed_at DESC) AS rn
       FROM property_condition_snapshots
       WHERE account_id = $1 AND property_id = $2
     ) ranked
     WHERE rn <= 3
     ORDER BY area, assessed_at DESC`,
    [session.accountId, pid]
  );

  // Group trend by area
  const trendByArea = new Map<string, typeof trend>();
  for (const row of trend) {
    const area = row.area as string;
    if (!trendByArea.has(area)) trendByArea.set(area, []);
    trendByArea.get(area)!.push(row);
  }

  const data = current.map((row) => ({
    ...row,
    trend: trendByArea.get(row.area as string) ?? [],
  }));

  return NextResponse.json({ data });
});
