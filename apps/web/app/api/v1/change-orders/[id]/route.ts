import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, withRole } from "@/lib/auth/middleware";
import { appendAuditLog } from "@/lib/db/audit";
import { getPool, queryOne } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// PATCH: update a draft change order (title, description, line items)
// POST with action=send | action=approve | action=decline

const updateChangeOrderSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  tax_rate: z.number().min(0).max(100).optional(),
  line_items: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        description: z.string().min(1),
        quantity: z.number().positive(),
        unit_price_cents: z.number().int().nonnegative(),
        sort_order: z.number().int().default(0),
      })
    )
    .optional(),
});

const actionSchema = z.object({
  action: z.enum(["send", "approve", "decline"]),
});

export const PATCH = withRole(["owner", "admin"], async (request, session) => {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: { message: "Missing change order id", traceId: session.traceId } }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { message: "Invalid JSON body", traceId: session.traceId } }, { status: 400 });
  }

  // Check if this is an action request
  const actionResult = actionSchema.safeParse(body);
  if (actionResult.success) {
    return handleAction(id, actionResult.data.action, session);
  }

  const parseResult = updateChangeOrderSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: { message: "Invalid request body", details: parseResult.error.issues, traceId: session.traceId } },
      { status: 400 }
    );
  }

  const data = parseResult.data;
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows: existingRows } = await client.query<{ id: string; status: string; subtotal_cents: number; tax_cents: number }>(
      `SELECT id, status, subtotal_cents, tax_cents FROM change_orders WHERE id = $1 AND account_id = $2`,
      [id, session.accountId]
    );
    const existing = existingRows[0] ?? null;

    if (!existing) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: { message: "Change order not found", traceId: session.traceId } }, { status: 404 });
    }

    if (existing.status !== "draft") {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: { message: "Only draft change orders can be edited", traceId: session.traceId } },
        { status: 422 }
      );
    }

    const updates: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (data.title !== undefined) { updates.push(`title = $${idx++}`); params.push(data.title); }
    if (data.description !== undefined) { updates.push(`description = $${idx++}`); params.push(data.description); }
    if (data.notes !== undefined) { updates.push(`notes = $${idx++}`); params.push(data.notes); }
    updates.push(`updated_at = now()`);

    // Handle line items if provided — push SET params before WHERE params
    if (data.line_items) {
      // Delete existing line items
      await client.query(`DELETE FROM change_order_line_items WHERE change_order_id = $1`, [id]);

      // Recalculate totals. Fall back to existing effective rate if omitted.
      const existingRate = existing.subtotal_cents > 0
        ? (existing.tax_cents / existing.subtotal_cents) * 100
        : 0;
      const taxRate = data.tax_rate ?? existingRate;

      const subtotalCents = data.line_items.reduce((sum, item) => {
        return sum + Math.round(item.quantity * item.unit_price_cents);
      }, 0);
      const taxCents = Math.round((subtotalCents * taxRate) / 100);
      const totalCents = subtotalCents + taxCents;

      updates.push(`subtotal_cents = $${idx++}`, `tax_cents = $${idx++}`, `total_cents = $${idx++}`);
      params.push(subtotalCents, taxCents, totalCents);

      // Insert new line items
      for (let i = 0; i < data.line_items.length; i++) {
        const item = data.line_items[i];
        await client.query(
          `INSERT INTO change_order_line_items (change_order_id, description, quantity, unit_price_cents, total_cents, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, item.description, item.quantity, item.unit_price_cents,
           Math.round(item.quantity * item.unit_price_cents), item.sort_order ?? i]
        );
      }
    }

    // Push WHERE params after all SET params so indices don't collide
    const whereIdx = idx;
    params.push(id, session.accountId);

    if (updates.length > 0) {
      await client.query(
        `UPDATE change_orders SET ${updates.join(", ")} WHERE id = $${whereIdx} AND account_id = $${whereIdx + 1}`,
        params
      );
    }

    await appendAuditLog(client, {
      account_id: session.accountId,
      entity_type: "change_order",
      entity_id: id,
      action: "update",
      actor_id: session.userId,
      trace_id: session.traceId,
      new_value: data,
    });

    await client.query("COMMIT");
    return NextResponse.json({ success: true });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("PATCH /api/v1/change-orders error", error as Error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { message: "Failed to update change order", traceId: session.traceId } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});

async function handleAction(id: string, action: string, session: { accountId: string; userId: string; traceId: string }) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows: existingRows } = await client.query<{ id: string; status: string; estimate_id: string; total_cents: number }>(
      `SELECT id, status, estimate_id, total_cents FROM change_orders WHERE id = $1 AND account_id = $2`,
      [id, session.accountId]
    );
    const existing = existingRows[0] ?? null;

    if (!existing) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: { message: "Change order not found", traceId: session.traceId } }, { status: 404 });
    }

    if (action === "send") {
      if (existing.status !== "draft") {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: { message: "Only draft change orders can be sent", traceId: session.traceId } }, { status: 422 });
      }
      await client.query(`UPDATE change_orders SET status = 'sent', updated_at = now() WHERE id = $1`, [id]);
    } else if (action === "approve") {
      if (existing.status !== "sent") {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: { message: "Only sent change orders can be approved", traceId: session.traceId } }, { status: 422 });
      }
      await client.query(
        `UPDATE change_orders SET status = 'approved', approved_by = $2, approved_at = now(), updated_at = now() WHERE id = $1`,
        [id, session.userId]
      );
    } else if (action === "decline") {
      if (!["draft", "sent"].includes(existing.status)) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: { message: "Only draft or sent change orders can be declined", traceId: session.traceId } }, { status: 422 });
      }
      await client.query(
        `UPDATE change_orders SET status = 'declined', declined_at = now(), updated_at = now() WHERE id = $1`,
        [id]
      );
    }

    await appendAuditLog(client, {
      account_id: session.accountId,
      entity_type: "change_order",
      entity_id: id,
      action: "update",
      actor_id: session.userId,
      trace_id: session.traceId,
      new_value: { action, status: action === "approve" ? "approved" : action === "decline" ? "declined" : "sent" },
    });

    await client.query("COMMIT");
    return NextResponse.json({ success: true, status: action === "approve" ? "approved" : action === "decline" ? "declined" : "sent" });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error(`PATCH /api/v1/change-orders action=${action} error`, error as Error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { message: `Failed to ${action} change order`, traceId: session.traceId } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

// GET /api/v1/change-orders/:id
export const GET = withAuth(async (request, session) => {
  const url = new URL(request.url);
  const id = url.pathname.split("/").pop();

  if (!id) {
    return NextResponse.json({ error: { message: "Missing change order id", traceId: session.traceId } }, { status: 400 });
  }

  try {
    const co = await queryOne<{
      id: string;
      estimate_id: string;
      title: string;
      description: string | null;
      status: string;
      subtotal_cents: number;
      tax_cents: number;
      total_cents: number;
      notes: string | null;
      created_by_name: string | null;
      approved_by_name: string | null;
      approved_at: string | null;
      declined_at: string | null;
      created_at: string;
    }>(
      `SELECT co.id, co.estimate_id, co.title, co.description, co.status,
              co.subtotal_cents, co.tax_cents, co.total_cents, co.notes,
              u.full_name as created_by_name,
              u2.full_name as approved_by_name,
              co.approved_at, co.declined_at, co.created_at
       FROM change_orders co
       LEFT JOIN users u ON u.id = co.created_by
       LEFT JOIN users u2 ON u2.id = co.approved_by
       WHERE co.id = $1 AND co.account_id = $2`,
      [id, session.accountId]
    );

    if (!co) {
      return NextResponse.json({ error: { message: "Change order not found", traceId: session.traceId } }, { status: 404 });
    }

    const { rows: items } = await getPool().query(
      `SELECT id, description, quantity, unit_price_cents, total_cents, sort_order
       FROM change_order_line_items
       WHERE change_order_id = $1
       ORDER BY sort_order ASC`,
      [id]
    );

    return NextResponse.json({ data: { ...co, line_items: items } });
  } catch (error) {
    logger.error("GET /api/v1/change-orders/:id error", error as Error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { message: "Failed to fetch change order", traceId: session.traceId } },
      { status: 500 }
    );
  }
});
