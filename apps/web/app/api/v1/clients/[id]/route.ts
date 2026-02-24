import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { getPool, queryOne } from "@/lib/db";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const patchClientBody = z
  .object({
    name: z.string().min(1).max(255).optional(),
    email: z.string().email().optional().or(z.literal("")),
    phone: z.string().max(50).optional().or(z.literal("")),
    notes: z.string().max(5000).optional().or(z.literal("")),
    company_name: z.string().max(255).optional().or(z.literal("")),
    address_line1: z.string().max(500).optional().or(z.literal("")),
    city: z.string().max(100).optional().or(z.literal("")),
    state: z.string().max(100).optional().or(z.literal("")),
    zip: z.string().max(20).optional().or(z.literal("")),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field is required" });

export const GET = withRole(["owner", "admin"], async (_request: NextRequest, session: AuthSession) => {
  const id = _request.nextUrl.pathname.split("/").at(-1) ?? "";
  const row = await queryOne(
    `SELECT c.*, 
            COUNT(DISTINCT p.id)::int AS property_count,
            COUNT(DISTINCT j.id)::int AS job_count,
            COUNT(DISTINCT e.id)::int AS estimate_count,
            COUNT(DISTINCT i.id)::int AS invoice_count
     FROM clients c
     LEFT JOIN properties p ON p.client_id = c.id AND p.account_id = c.account_id
     LEFT JOIN jobs j ON j.client_id = c.id AND j.account_id = c.account_id
     LEFT JOIN estimates e ON e.client_id = c.id AND e.account_id = c.account_id
     LEFT JOIN invoices i ON i.client_id = c.id AND i.account_id = c.account_id
     WHERE c.id = $1 AND c.account_id = $2
     GROUP BY c.id`,
    [id, session.accountId]
  );

  if (!row) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Client not found", traceId: session.traceId } },
      { status: 404 }
    );
  }

  return NextResponse.json({ data: row });
});

export const PATCH = withRole(["owner", "admin"], async (request: NextRequest, session: AuthSession) => {
  const id = request.nextUrl.pathname.split("/").at(-1) ?? "";
  const body = await request.json().catch(() => null);
  const parsed = patchClientBody.safeParse(body);
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

    const before = await client.query(`SELECT * FROM clients WHERE id = $1 AND account_id = $2`, [id, session.accountId]);
    if (before.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Client not found", traceId: session.traceId } },
        { status: 404 }
      );
    }

    const patch = parsed.data;
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (patch.name !== undefined) {
      setClauses.push(`name = $${idx++}`);
      params.push(patch.name.trim());
    }
    if (patch.email !== undefined) {
      setClauses.push(`email = $${idx++}`);
      params.push(patch.email || null);
    }
    if (patch.phone !== undefined) {
      setClauses.push(`phone = $${idx++}`);
      params.push(patch.phone || null);
    }
    if (patch.notes !== undefined) {
      setClauses.push(`notes = $${idx++}`);
      params.push(patch.notes || null);
    }
    if (patch.company_name !== undefined) {
      setClauses.push(`company_name = $${idx++}`);
      params.push(patch.company_name || null);
    }
    if (patch.address_line1 !== undefined) {
      setClauses.push(`address_line1 = $${idx++}`);
      params.push(patch.address_line1 || null);
    }
    if (patch.city !== undefined) {
      setClauses.push(`city = $${idx++}`);
      params.push(patch.city || null);
    }
    if (patch.state !== undefined) {
      setClauses.push(`state = $${idx++}`);
      params.push(patch.state || null);
    }
    if (patch.zip !== undefined) {
      setClauses.push(`zip = $${idx++}`);
      params.push(patch.zip || null);
    }
    params.push(id, session.accountId);

    const result = await client.query(
      `UPDATE clients SET ${setClauses.join(", ")}, updated_at = now()
       WHERE id = $${idx++} AND account_id = $${idx}
       RETURNING *`,
      params
    );
    const updated = result.rows[0];

    await appendAuditLog(client, {
      account_id: session.accountId,
      entity_type: "client",
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
    logger.error("[clients PATCH]", err, { traceId: session.traceId, clientId: id });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to update client", traceId: session.traceId } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});
