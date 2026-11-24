/**
 * GET    /api/v1/materials/[id]  — fetch one saved material
 * PATCH  /api/v1/materials/[id]  — update price / fields
 * DELETE /api/v1/materials/[id]  — soft delete (is_active = false)
 */
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, withRole } from "@/lib/auth/middleware";
import { recordObservations } from "@/lib/materials/ledger";
import type { StoreFamily } from "@ai-fsm/domain";
import type { AuthSession } from "@/lib/auth/middleware";
import { queryOne, getPool } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

function extractId(url: string) {
  return url.match(/\/materials\/([^/]+)/)?.[1] ?? null;
}

/**
 * A price is never written directly (TASK-210): a new price is a manual check with
 * the price you saw and where you saw it, recorded in the price ledger.
 */
const patchSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  brand: z.string().max(100).nullable().optional(),
  supplier: z.string().max(100).nullable().optional(),
  sku: z.string().max(100).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  observed_price_cents: z.number().int().positive().optional(),
  observed_source: z.string().trim().min(1).max(200).optional(),
  observed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict()
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" })
  .refine((v) => (v.observed_price_cents === undefined) === (v.observed_source === undefined), {
    message: "Enter the price you saw and where you saw it",
    path: ["observed_source"],
  });

const DIRECT_PRICE_FIELDS = ["unit_cost_cents", "last_purchased_at", "avg_paid_cents", "purchase_count"];

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

export const PATCH = withRole(["owner", "admin"], async (request: NextRequest, session: AuthSession) => {
  const id = extractId(request.url);
  if (!id) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found", traceId: session.traceId } }, { status: 404 });

  let body: unknown = {};
  try { body = await request.json(); } catch { /* ok */ }

  if (body && typeof body === "object" && DIRECT_PRICE_FIELDS.some((f) => f in body)) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Prices are not edited directly. Enter the price you saw and where you saw it.",
          traceId: session.traceId,
        },
      },
      { status: 422 },
    );
  }

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
      supplier: d.supplier,
      sku: d.sku,
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

    if (d.observed_price_cents !== undefined && d.observed_source) {
      const observedOn = d.observed_on ?? new Date().toISOString().slice(0, 10);
      await recordObservations(client, session.accountId, [{
        variantId: id,
        kind: "manual_check",
        observedOn,
        unitPriceCents: d.observed_price_cents,
        storeFamily: (rows[0] as { store_family: StoreFamily }).store_family,
        sourceRef: `manual:${id}`,
        dedupeKey: `manual:${id}:${randomUUID()}`,
        enteredBy: session.userId,
        note: d.observed_source,
      }]);
    }

    const fresh = await client.query(`SELECT * FROM materials_price_book WHERE id = $1 AND account_id = $2`, [id, session.accountId]);
    await client.query("COMMIT");
    return NextResponse.json({ data: fresh.rows[0] });
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
