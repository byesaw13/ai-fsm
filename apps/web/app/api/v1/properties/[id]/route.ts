import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { getPool, queryOne } from "@/lib/db";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const patchPropertyBody = z
  .object({
    client_id: z.string().uuid().optional(),
    name: z.string().max(255).optional().or(z.literal("")),
    address: z.string().min(1).max(500).optional(),
    city: z.string().max(100).optional().or(z.literal("")),
    state: z.string().max(100).optional().or(z.literal("")),
    zip: z.string().max(20).optional().or(z.literal("")),
    notes: z.string().max(5000).optional().or(z.literal("")),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field is required" });

export const GET = withRole(["owner", "admin"], async (request: NextRequest, session: AuthSession) => {
  const id = request.nextUrl.pathname.split("/").at(-1) ?? "";
  const row = await queryOne(
    `SELECT p.*, c.name AS client_name,
            COUNT(DISTINCT j.id)::int AS job_count,
            COUNT(DISTINCT v.id)::int AS visit_count
     FROM properties p
     JOIN clients c ON c.id = p.client_id AND c.account_id = p.account_id
     LEFT JOIN jobs j ON j.property_id = p.id AND j.account_id = p.account_id
     LEFT JOIN visits v ON v.job_id = j.id AND v.account_id = p.account_id
     WHERE p.id = $1 AND p.account_id = $2
     GROUP BY p.id, c.name`,
    [id, session.accountId]
  );
  if (!row) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Property not found", traceId: session.traceId } },
      { status: 404 }
    );
  }
  return NextResponse.json({ data: row });
});

export const PATCH = withRole(["owner", "admin"], async (request: NextRequest, session: AuthSession) => {
  const id = request.nextUrl.pathname.split("/").at(-1) ?? "";
  const body = await request.json().catch(() => null);
  const parsed = patchPropertyBody.safeParse(body);
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
      `SET LOCAL app.current_user_id = $1; SET LOCAL app.current_account_id = $2; SET LOCAL app.current_role = $3`,
      [session.userId, session.accountId, session.role]
    );

    const before = await client.query(`SELECT * FROM properties WHERE id = $1 AND account_id = $2`, [id, session.accountId]);
    if (before.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Property not found", traceId: session.traceId } },
        { status: 404 }
      );
    }

    const patch = parsed.data;
    if (patch.client_id) {
      const ownerClient = await client.query(`SELECT id FROM clients WHERE id = $1 AND account_id = $2`, [patch.client_id, session.accountId]);
      if (ownerClient.rowCount === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Client not found", traceId: session.traceId } },
          { status: 404 }
        );
      }
    }

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    const assign = (col: string, value: unknown) => {
      setClauses.push(`${col} = $${idx++}`);
      params.push(value);
    };
    if (patch.client_id !== undefined) assign("client_id", patch.client_id);
    if (patch.name !== undefined) assign("name", patch.name || null);
    if (patch.address !== undefined) assign("address", patch.address.trim());
    if (patch.city !== undefined) assign("city", patch.city || null);
    if (patch.state !== undefined) assign("state", patch.state || null);
    if (patch.zip !== undefined) assign("zip", patch.zip || null);
    if (patch.notes !== undefined) assign("notes", patch.notes || null);
    params.push(id, session.accountId);

    const result = await client.query(
      `UPDATE properties SET ${setClauses.join(", ")}, updated_at = now()
       WHERE id = $${idx++} AND account_id = $${idx}
       RETURNING *`,
      params
    );
    const updated = result.rows[0];

    await appendAuditLog(client, {
      account_id: session.accountId,
      entity_type: "property",
      entity_id: id,
      action: "update",
      actor_id: session.userId,
      trace_id: session.traceId,
      old_value: before.rows[0],
      new_value: updated,
    });

    await client.query("COMMIT");
    return NextResponse.json({ data: updated });
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error("[properties PATCH]", err, { traceId: session.traceId, propertyId: id });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to update property", traceId: session.traceId } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});
