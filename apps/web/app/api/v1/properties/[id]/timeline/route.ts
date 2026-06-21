import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "../../../../../../lib/auth/middleware";
import type { AuthSession } from "../../../../../../lib/auth/middleware";
import { query, queryOne } from "../../../../../../lib/db";

export const dynamic = "force-dynamic";

function propertyId(request: NextRequest) {
  return request.url.match(/\/properties\/([^/]+)\/timeline/)?.[1] ?? null;
}

const ALLOWED_EVENT_TYPES = new Set([
  "visit", "estimate", "invoice", "payment", "vault_item", "photo", "issue", "note",
]);

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

  const url = new URL(request.url);
  const limitParam = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 100);
  const cursor = url.searchParams.get("cursor") ?? null;
  const rawTypes = url.searchParams.get("event_type");
  const filterTypes = rawTypes
    ? rawTypes.split(",").filter((t) => ALLOWED_EVENT_TYPES.has(t))
    : null;

  const typeClause = filterTypes && filterTypes.length > 0
    ? `AND event_type = ANY($4::text[])`
    : "";
  const cursorClause = cursor ? `AND occurred_at < $${filterTypes && filterTypes.length > 0 ? 5 : 4}` : "";

  const params: unknown[] = [session.accountId, pid, limitParam];
  if (filterTypes && filterTypes.length > 0) params.push(filterTypes);
  if (cursor) params.push(cursor);

  const events = await query(
    `SELECT event_type, entity_id, occurred_at, summary, metadata
     FROM property_timeline_v
     WHERE account_id = $1
       AND property_id = $2
       ${typeClause}
       ${cursorClause}
     ORDER BY occurred_at DESC NULLS LAST
     LIMIT $3`,
    params
  );

  const nextCursor =
    events.length === limitParam ? events[events.length - 1].occurred_at : null;

  return NextResponse.json({ data: events, nextCursor });
});
