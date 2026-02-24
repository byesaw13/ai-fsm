import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { getPool, query } from "@/lib/db";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const createPropertyBody = z.object({
  client_id: z.string().uuid(),
  name: z.string().max(255).optional().or(z.literal("")),
  address: z.string().min(1).max(500),
  city: z.string().max(100).optional().or(z.literal("")),
  state: z.string().max(100).optional().or(z.literal("")),
  zip: z.string().max(20).optional().or(z.literal("")),
  notes: z.string().max(5000).optional().or(z.literal("")),
});

export const GET = withRole(["owner", "admin"], async (request: NextRequest, session: AuthSession) => {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const clientId = searchParams.get("client_id") ?? "";
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "100"), 1), 200);

  const params: unknown[] = [session.accountId];
  const conditions = ["p.account_id = $1"];
  let idx = 2;
  if (clientId) {
    conditions.push(`p.client_id = $${idx++}`);
    params.push(clientId);
  }
  if (q) {
    conditions.push(`(LOWER(p.address) LIKE $${idx} OR LOWER(COALESCE(p.name, '')) LIKE $${idx} OR LOWER(COALESCE(c.name, '')) LIKE $${idx})`);
    params.push(`%${q}%`);
    idx++;
  }
  params.push(limit);

  const rows = await query(
    `SELECT p.*, c.name AS client_name,
            COUNT(DISTINCT j.id)::int AS job_count,
            COUNT(DISTINCT v.id)::int AS visit_count
     FROM properties p
     JOIN clients c ON c.id = p.client_id AND c.account_id = p.account_id
     LEFT JOIN jobs j ON j.property_id = p.id AND j.account_id = p.account_id
     LEFT JOIN visits v ON v.job_id = j.id AND v.account_id = p.account_id
     WHERE ${conditions.join(" AND ")}
     GROUP BY p.id, c.name
     ORDER BY c.name ASC, p.address ASC
     LIMIT $${idx}`,
    params
  );

  return NextResponse.json({ data: rows, limit });
});

export const POST = withRole(["owner", "admin"], async (request: NextRequest, session: AuthSession) => {
  const body = await request.json().catch(() => null);
  const parsed = createPropertyBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: parsed.error.flatten().fieldErrors,
          traceId: session.traceId,
        },
      },
      { status: 422 }
    );
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true), set_config('app.current_account_id', $2, true), set_config('app.current_role', $3, true)`,
      [session.userId, session.accountId, session.role]
    );

    const { client_id, name, address, city, state, zip, notes } = parsed.data;
    const ownerClient = await client.query(
      `SELECT id FROM clients WHERE id = $1 AND account_id = $2`,
      [client_id, session.accountId]
    );
    if (ownerClient.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Client not found", traceId: session.traceId } },
        { status: 404 }
      );
    }

    const result = await client.query(
      `INSERT INTO properties (account_id, client_id, name, address, city, state, zip, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [session.accountId, client_id, name || null, address.trim(), city || null, state || null, zip || null, notes || null]
    );
    const created = result.rows[0];

    await appendAuditLog(client, {
      account_id: session.accountId,
      entity_type: "property",
      entity_id: created.id,
      action: "insert",
      actor_id: session.userId,
      trace_id: session.traceId,
      new_value: created,
    });

    await client.query("COMMIT");
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error("[properties POST]", err, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to create property", traceId: session.traceId } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});
