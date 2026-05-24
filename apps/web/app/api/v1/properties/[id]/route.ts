import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { getPool, queryOne } from "@/lib/db";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@/lib/logger";
import { getPathId } from "@/lib/route-utils";

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
  const id = getPathId(request.nextUrl.pathname);
  const row = await queryOne(
    `SELECT p.*, c.name AS client_name,
            COUNT(DISTINCT j.id)::int AS job_count,
            COUNT(DISTINCT v.id)::int AS visit_count,
            (SELECT MIN(v2.scheduled_start)
             FROM visits v2 JOIN jobs j2 ON j2.id = v2.job_id
             WHERE j2.property_id = p.id AND v2.account_id = p.account_id
               AND v2.status = 'scheduled' AND v2.scheduled_start > now()
            ) AS next_visit_at,
            (SELECT COUNT(*)::int FROM jobs aj
             WHERE aj.property_id = p.id AND aj.account_id = p.account_id
               AND aj.status IN ('scheduled', 'in_progress')
            ) AS active_jobs,
            (SELECT COUNT(*)::int FROM estimates pe
             WHERE pe.property_id = p.id AND pe.account_id = p.account_id
               AND pe.status IN ('draft', 'sent')
            ) AS pending_estimates,
            (SELECT COALESCE(SUM(oi.total_cents), 0)::int FROM invoices oi
             WHERE oi.property_id = p.id AND oi.account_id = p.account_id
               AND oi.status IN ('sent', 'partial', 'overdue')
            ) AS outstanding_cents,
            (SELECT COUNT(*)::int FROM property_issues pi2
             WHERE pi2.property_id = p.id AND pi2.account_id = p.account_id
               AND pi2.status IN ('open', 'monitoring')
            ) AS open_issues_count
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
  const id = getPathId(request.nextUrl.pathname);
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
      `SELECT set_config('app.current_user_id', $1, true), set_config('app.current_account_id', $2, true), set_config('app.current_role', $3, true)`,
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
