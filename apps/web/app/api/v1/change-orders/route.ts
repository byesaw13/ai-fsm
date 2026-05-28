import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, withRole } from "@/lib/auth/middleware";
import { appendAuditLog } from "@/lib/db/audit";
import { getPool, queryOne } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const lineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unit_price_cents: z.number().int().nonnegative(),
  sort_order: z.number().int().default(0),
});

const createChangeOrderSchema = z.object({
  estimate_id: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  tax_rate: z.number().min(0).max(100).default(0),
  line_items: z.array(lineItemSchema).min(1),
});

export const POST = withRole(["owner", "admin", "tech"], async (request, session) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { message: "Invalid JSON body", traceId: session.traceId } },
      { status: 400 }
    );
  }

  const parseResult = createChangeOrderSchema.safeParse(body);
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

    // Verify estimate belongs to account and is approved
    const estimate = await queryOne<{ id: string; status: string; client_id: string }>(
      `SELECT id, status, client_id FROM estimates WHERE id = $1 AND account_id = $2`,
      [data.estimate_id, session.accountId]
    );

    if (!estimate) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: { message: "Estimate not found", traceId: session.traceId } },
        { status: 404 }
      );
    }

    if (estimate.status !== "approved") {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: { message: "Change orders can only be created for approved estimates", traceId: session.traceId } },
        { status: 422 }
      );
    }

    // Calculate totals
    const subtotalCents = data.line_items.reduce((sum, item) => {
      return sum + Math.round(item.quantity * item.unit_price_cents);
    }, 0);
    const taxCents = Math.round((subtotalCents * data.tax_rate) / 100);
    const totalCents = subtotalCents + taxCents;

    // Create change order
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO change_orders (estimate_id, account_id, title, description, notes,
                                   subtotal_cents, tax_cents, total_cents, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', $9)
       RETURNING id`,
      [data.estimate_id, session.accountId, data.title, data.description ?? null, data.notes ?? null,
       subtotalCents, taxCents, totalCents, session.userId]
    );

    const changeOrderId = rows[0].id;

    // Insert line items
    for (let i = 0; i < data.line_items.length; i++) {
      const item = data.line_items[i];
      await client.query(
        `INSERT INTO change_order_line_items (change_order_id, description, quantity, unit_price_cents, total_cents, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [changeOrderId, item.description, item.quantity, item.unit_price_cents,
         Math.round(item.quantity * item.unit_price_cents), item.sort_order ?? i]
      );
    }

    // Audit log
    await appendAuditLog(client, {
      account_id: session.accountId,
      entity_type: "change_order",
      entity_id: changeOrderId,
      action: "insert",
      actor_id: session.userId,
      trace_id: session.traceId,
      new_value: { estimate_id: data.estimate_id, title: data.title, total_cents: totalCents },
    });

    await client.query("COMMIT");

    return NextResponse.json({ id: changeOrderId }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("POST /api/v1/change-orders error", error as Error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { message: "Failed to create change order", traceId: session.traceId } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});

export const GET = withAuth(async (request, session) => {
  const { searchParams } = new URL(request.url);
  const estimateId = searchParams.get("estimate_id");

  try {
    let query = `
      SELECT co.*, e.client_id,
             u.full_name as created_by_name,
             u2.full_name as approved_by_name
      FROM change_orders co
      JOIN estimates e ON e.id = co.estimate_id
      LEFT JOIN users u ON u.id = co.created_by
      LEFT JOIN users u2 ON u2.id = co.approved_by
      WHERE co.account_id = $1
    `;
    const params: unknown[] = [session.accountId];

    if (estimateId) {
      query += ` AND co.estimate_id = $2`;
      params.push(estimateId);
    }

    query += ` ORDER BY co.created_at DESC`;

    const { rows } = await getPool().query(query, params);

    // Fetch line items for each change order
    for (const co of rows) {
      const { rows: items } = await getPool().query(
        `SELECT id, description, quantity, unit_price_cents, total_cents, sort_order
         FROM change_order_line_items
         WHERE change_order_id = $1
         ORDER BY sort_order ASC`,
        [co.id]
      );
      co.line_items = items;
    }

    return NextResponse.json({ data: rows });
  } catch (error) {
    logger.error("GET /api/v1/change-orders error", error as Error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { message: "Failed to fetch change orders", traceId: session.traceId } },
      { status: 500 }
    );
  }
});
