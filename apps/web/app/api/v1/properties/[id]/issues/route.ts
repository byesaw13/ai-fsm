import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "../../../../../../lib/auth/middleware";
import type { AuthSession } from "../../../../../../lib/auth/middleware";
import { query, queryOne, getPool } from "../../../../../../lib/db";
import { logger } from "../../../../../../lib/logger";

export const dynamic = "force-dynamic";

function propertyId(request: NextRequest) {
  return request.url.match(/\/properties\/([^/]+)\/issues/)?.[1] ?? null;
}

const createBody = z.object({
  area:               z.string().min(1).max(200),
  item_key:           z.string().min(1).max(200),
  title:              z.string().min(1).max(500),
  description:        z.string().max(4000).optional(),
  severity:           z.enum(["minor", "moderate", "major", "critical"]).default("minor"),
  status:             z.enum(["open", "monitoring"]).default("open"),
  linked_estimate_id: z.string().uuid().optional(),
});

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
  const statusFilter = url.searchParams.get("status")?.split(",") ?? ["open", "monitoring"];

  const issues = await query(
    `SELECT id, area, item_key, title, description, status, severity,
            occurrence_count, first_noted_at, last_noted_at,
            resolved_at, resolved_note, linked_estimate_id, auto_detected
     FROM property_issues
     WHERE account_id = $1 AND property_id = $2 AND status = ANY($3::text[])
     ORDER BY
       CASE severity WHEN 'critical' THEN 1 WHEN 'major' THEN 2 WHEN 'moderate' THEN 3 ELSE 4 END,
       last_noted_at DESC`,
    [session.accountId, pid, statusFilter]
  );

  return NextResponse.json({ data: issues });
});

export const POST = withAuth(async (request: NextRequest, session: AuthSession) => {
  if (!["owner", "admin", "tech"].includes(session.role)) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Insufficient role", traceId: session.traceId } },
      { status: 403 }
    );
  }

  const pid = propertyId(request);
  if (!pid) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Property not found", traceId: session.traceId } },
      { status: 404 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = createBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: parsed.error.flatten().fieldErrors, traceId: session.traceId } },
      { status: 422 }
    );
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true),
              set_config('app.current_account_id', $2, true),
              set_config('app.current_role', $3, true)`,
      [session.userId, session.accountId, session.role]
    );

    const prop = await client.query(
      `SELECT id FROM properties WHERE id = $1 AND account_id = $2`,
      [pid, session.accountId]
    );
    if (!prop.rows[0]) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Property not found", traceId: session.traceId } },
        { status: 404 }
      );
    }

    const d = parsed.data;
    const { rows } = await client.query(
      `INSERT INTO property_issues
         (account_id, property_id, area, item_key, title, description,
          severity, status, auto_detected, linked_estimate_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, $9)
       ON CONFLICT (property_id, item_key) WHERE status IN ('open','monitoring')
       DO UPDATE SET
         occurrence_count = property_issues.occurrence_count + 1,
         last_noted_at    = now(),
         severity         = EXCLUDED.severity,
         updated_at       = now()
       RETURNING *`,
      [
        session.accountId, pid, d.area, d.item_key, d.title,
        d.description ?? null, d.severity, d.status,
        d.linked_estimate_id ?? null,
      ]
    );

    await client.query("COMMIT");
    return NextResponse.json({ data: rows[0] }, { status: 201 });
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error("[property issues POST]", err, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to create issue", traceId: session.traceId } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});
