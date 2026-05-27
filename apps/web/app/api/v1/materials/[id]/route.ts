/**
 * GET    /api/v1/materials/[id]  — fetch one saved material
 * PATCH  /api/v1/materials/[id]  — update price / fields
 * DELETE /api/v1/materials/[id]  — soft delete (is_active = false)
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { queryOne, getPool } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

function extractId(url: string) {
  return url.match(/\/materials\/([^/]+)/)?.[1] ?? null;
}

const patchSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  brand: z.string().max(100).nullable().optional(),
  unit_cost_cents: z.number().int().min(0).optional(),
  supplier: z.string().max(100).nullable().optional(),
  sku: z.string().max(100).nullable().optional(),
  last_purchased_at: z.string().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
}).refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

export const GET = withAuth(async (request: NextRequest, session: AuthSession) => {
  const id = extractId(request.url);
  if (!id) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found", traceId: session.traceId } }, { status: 404 });

  const row = await queryOne(
    `SELECT * FROM materials_price_book WHERE id = $1 AND account_id = $2`,
    [id, session.accountId]
  );
  if (!row) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Material not found", traceId: session.traceId } }, { status: 404 });

  return NextResponse.json({ data: row });
});

export const PATCH = withAuth(async (request: NextRequest, session: AuthSession) => {
  const id = extractId(request.url);
  if (!id) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found", traceId: session.traceId } }, { status: 404 });

  let body: unknown = {};
  try { body = await request.json(); } catch { /* ok */ }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid body", details: parsed.error.issues, traceId: session.traceId } },
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

    const setClauses: string[] = ["updated_at = now()"];
    const params: unknown[] = [];
    let idx = 1;

    const d = parsed.data;
    const fieldMap: Record<string, unknown> = {
      name: d.name,
      brand: d.brand,
      unit_cost_cents: d.unit_cost_cents,
      supplier: d.supplier,
      sku: d.sku,
      last_purchased_at: d.last_purchased_at,
      notes: d.notes,
    };

    for (const [col, val] of Object.entries(fieldMap)) {
      if (val !== undefined) {
        setClauses.push(`${col} = $${idx++}`);
        params.push(val);
      }
    }

    params.push(id, session.accountId);
    const { rows } = await client.query(
      `UPDATE materials_price_book SET ${setClauses.join(", ")}
       WHERE id = $${idx++} AND account_id = $${idx} RETURNING *`,
      params
    );

    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Material not found", traceId: session.traceId } }, { status: 404 });
    }

    await client.query("COMMIT");
    return NextResponse.json({ data: rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error("PATCH /api/v1/materials/[id] error", err, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to update material", traceId: session.traceId } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});

export const DELETE = withAuth(async (request: NextRequest, session: AuthSession) => {
  const id = extractId(request.url);
  if (!id) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found", traceId: session.traceId } }, { status: 404 });

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

    const { rowCount } = await client.query(
      `UPDATE materials_price_book SET is_active = false, updated_at = now()
       WHERE id = $1 AND account_id = $2`,
      [id, session.accountId]
    );

    if (!rowCount) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Material not found", traceId: session.traceId } }, { status: 404 });
    }

    await client.query("COMMIT");
    return NextResponse.json({ data: { deleted: true } });
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error("DELETE /api/v1/materials/[id] error", err, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to delete material", traceId: session.traceId } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});
