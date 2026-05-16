import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "../../../../../../lib/auth/middleware";
import type { AuthSession } from "../../../../../../lib/auth/middleware";
import { query, queryOne, getPool } from "../../../../../../lib/db";
import { logger } from "../../../../../../lib/logger";

export const dynamic = "force-dynamic";

function propertyId(request: NextRequest) {
  return request.url.match(/\/properties\/([^/]+)\/notes/)?.[1] ?? null;
}

const createBody = z.object({
  body:     z.string().min(1).max(4000),
  visit_id: z.string().uuid().optional(),
  pinned:   z.boolean().default(false),
  source:   z.enum(["technician", "office"]).default("office"),
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

  const notes = await query(
    `SELECT id, source, body, pinned, visit_id, created_by, created_at
     FROM property_notes
     WHERE account_id = $1 AND property_id = $2
     ORDER BY pinned DESC, created_at DESC
     LIMIT 100`,
    [session.accountId, pid]
  );

  return NextResponse.json({ data: notes });
});

export const POST = withAuth(async (request: NextRequest, session: AuthSession) => {
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
      `INSERT INTO property_notes
         (account_id, property_id, source, body, pinned, visit_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        session.accountId, pid, d.source, d.body,
        d.pinned, d.visit_id ?? null, session.userId,
      ]
    );

    await client.query("COMMIT");
    return NextResponse.json({ data: rows[0] }, { status: 201 });
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error("[property notes POST]", err, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to create note", traceId: session.traceId } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});
