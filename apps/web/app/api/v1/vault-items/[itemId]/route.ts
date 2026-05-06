import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { withAuth } from "../../../../../lib/auth/middleware";
import type { AuthSession } from "../../../../../lib/auth/middleware";
import { getPool } from "../../../../../lib/db";
import { appendAuditLog } from "../../../../../lib/db/audit";
import { logger } from "../../../../../lib/logger";
import { VAULT_CATEGORIES } from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

const vaultCategorySchema = z.enum(
  VAULT_CATEGORIES as unknown as [string, ...string[]]
);

const updateBody = z.object({
  category:           vaultCategorySchema.optional(),
  name:               z.string().min(1).max(255).optional(),
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

function itemId(request: NextRequest): string | null {
  return request.url.match(/\/vault-items\/([^/]+)/)?.[1] ?? null;
}

export const PATCH = withAuth(
  async (request: NextRequest, session: AuthSession) => {
    if (!["owner", "admin", "tech"].includes(session.role)) {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Insufficient role", traceId: session.traceId } }, { status: 403 });
    }

    const id = itemId(request);
    if (!id) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Vault item not found", traceId: session.traceId } }, { status: 404 });

    const body = await request.json().catch(() => null);
    const parsed = updateBody.safeParse(body);
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

      const existing = await client.query(
        `SELECT * FROM property_vault_items WHERE id = $1 AND account_id = $2 FOR UPDATE`,
        [id, session.accountId]
      );
      if (!existing.rows[0]) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: { code: "NOT_FOUND", message: "Vault item not found", traceId: session.traceId } }, { status: 404 });
      }

      const old = existing.rows[0];
      const fields: string[] = [];
      const values: unknown[] = [];
      let idx = 3;

      for (const [key, val] of Object.entries(parsed.data)) {
        if (val !== undefined) {
          fields.push(`${key} = $${idx++}`);
          values.push(val);
        }
      }

      if (fields.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ data: old });
      }

      const { rows } = await client.query(
        `UPDATE property_vault_items SET ${fields.join(", ")}, updated_at = now()
         WHERE id = $1 AND account_id = $2 RETURNING *`,
        [id, session.accountId, ...values]
      );

      await appendAuditLog(client, {
        account_id: session.accountId, entity_type: "vault_item", entity_id: id,
        action: "update", actor_id: session.userId, trace_id: session.traceId,
        old_value: old, new_value: rows[0],
      });

      await client.query("COMMIT");
      return NextResponse.json({ data: rows[0] });
    } catch (err) {
      await client.query("ROLLBACK");
      logger.error("[vault-items PATCH]", err, { traceId: session.traceId });
      return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Failed to update vault item", traceId: session.traceId } }, { status: 500 });
    } finally {
      client.release();
    }
  }
);

export const DELETE = withAuth(
  async (request: NextRequest, session: AuthSession) => {
    if (!["owner", "admin"].includes(session.role)) {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Owner or admin required", traceId: session.traceId } }, { status: 403 });
    }

    const id = itemId(request);
    if (!id) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Vault item not found", traceId: session.traceId } }, { status: 404 });

    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `SELECT set_config('app.current_user_id', $1, true), set_config('app.current_account_id', $2, true), set_config('app.current_role', $3, true)`,
        [session.userId, session.accountId, session.role]
      );

      const existing = await client.query(
        `SELECT * FROM property_vault_items WHERE id = $1 AND account_id = $2 FOR UPDATE`,
        [id, session.accountId]
      );
      if (!existing.rows[0]) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: { code: "NOT_FOUND", message: "Vault item not found", traceId: session.traceId } }, { status: 404 });
      }

      await client.query(`DELETE FROM property_vault_items WHERE id = $1`, [id]);

      await appendAuditLog(client, {
        account_id: session.accountId, entity_type: "vault_item", entity_id: id,
        action: "delete", actor_id: session.userId, trace_id: session.traceId,
        old_value: existing.rows[0],
      });

      await client.query("COMMIT");

      const uploadDir = path.join("/app/uploads/vault-items", id);
      try {
        fs.rmSync(uploadDir, { recursive: true, force: true });
      } catch (err) {
        logger.warn("[vault-items DELETE] failed to remove media directory", { uploadDir, err, traceId: session.traceId });
      }

      return NextResponse.json({ deleted: true });
    } catch (err) {
      await client.query("ROLLBACK");
      logger.error("[vault-items DELETE]", err, { traceId: session.traceId });
      return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Failed to delete vault item", traceId: session.traceId } }, { status: 500 });
    } finally {
      client.release();
    }
  }
);
