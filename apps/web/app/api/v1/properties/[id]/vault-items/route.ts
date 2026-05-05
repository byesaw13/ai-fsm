import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "../../../../../../lib/auth/middleware";
import type { AuthSession } from "../../../../../../lib/auth/middleware";
import { query, queryOne, getPool } from "../../../../../../lib/db";
import { appendAuditLog } from "../../../../../../lib/db/audit";
import { logger } from "../../../../../../lib/logger";
import { VAULT_CATEGORIES } from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

const vaultCategorySchema = z.enum(
  VAULT_CATEGORIES as unknown as [string, ...string[]]
);

const createBody = z.object({
  category:           vaultCategorySchema,
  name:               z.string().min(1).max(255),
  location:           z.string().max(255).nullable().optional(),
  manufacturer:       z.string().max(255).nullable().optional(),
  model_number:       z.string().max(255).nullable().optional(),
  serial_number:      z.string().max(255).nullable().optional(),
  install_date:       z.string().date().nullable().optional(),
  last_serviced_date: z.string().date().nullable().optional(),
  next_service_date:  z.string().date().nullable().optional(),
  notes:              z.string().max(5000).nullable().optional(),
  linked_visit_id:    z.string().uuid().nullable().optional(),
});

function propertyId(request: NextRequest): string | null {
  return request.url.match(/\/properties\/([^/]+)\/vault-items/)?.[1] ?? null;
}

export const GET = withAuth(
  async (request: NextRequest, session: AuthSession) => {
    const pid = propertyId(request);
    if (!pid) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Property not found", traceId: session.traceId } }, { status: 404 });

    // Verify property belongs to this account
    const prop = await queryOne(
      `SELECT id FROM properties WHERE id = $1 AND account_id = $2`,
      [pid, session.accountId]
    );
    if (!prop) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Property not found", traceId: session.traceId } }, { status: 404 });

    const items = await query(
      `SELECT * FROM property_vault_items
       WHERE property_id = $1 AND account_id = $2
       ORDER BY category ASC, name ASC`,
      [pid, session.accountId]
    );

    return NextResponse.json({ data: items });
  }
);

export const POST = withAuth(
  async (request: NextRequest, session: AuthSession) => {
    if (!["owner", "admin", "tech"].includes(session.role)) {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Insufficient role", traceId: session.traceId } }, { status: 403 });
    }

    const pid = propertyId(request);
    if (!pid) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Property not found", traceId: session.traceId } }, { status: 404 });

    const body = await request.json().catch(() => null);
    const parsed = createBody.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: parsed.error.flatten().fieldErrors, traceId: session.traceId } }, { status: 422 });
    }

    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `SELECT set_config('app.current_user_id', $1, true), set_config('app.current_account_id', $2, true), set_config('app.current_role', $3, true)`,
        [session.userId, session.accountId, session.role]
      );

      const prop = await client.query(
        `SELECT id FROM properties WHERE id = $1 AND account_id = $2`,
        [pid, session.accountId]
      );
      if (!prop.rows[0]) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: { code: "NOT_FOUND", message: "Property not found", traceId: session.traceId } }, { status: 404 });
      }

      const d = parsed.data;
      const { rows } = await client.query(
        `INSERT INTO property_vault_items
           (account_id, property_id, category, name, location, manufacturer,
            model_number, serial_number, install_date, last_serviced_date,
            next_service_date, notes, linked_visit_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING *`,
        [
          session.accountId, pid, d.category, d.name,
          d.location ?? null, d.manufacturer ?? null,
          d.model_number ?? null, d.serial_number ?? null,
          d.install_date ?? null, d.last_serviced_date ?? null,
          d.next_service_date ?? null, d.notes ?? null,
          d.linked_visit_id ?? null, session.userId,
        ]
      );

      await appendAuditLog(client, {
        account_id: session.accountId, entity_type: "vault_item", entity_id: rows[0].id,
        action: "insert", actor_id: session.userId, trace_id: session.traceId,
        new_value: rows[0],
      });

      await client.query("COMMIT");
      return NextResponse.json({ data: rows[0] }, { status: 201 });
    } catch (err) {
      await client.query("ROLLBACK");
      logger.error("[vault-items POST]", err, { traceId: session.traceId });
      return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Failed to create vault item", traceId: session.traceId } }, { status: 500 });
    } finally {
      client.release();
    }
  }
);
