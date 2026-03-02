import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, withRole } from "@/lib/auth/middleware";
import { withInvoiceContext, generateInvoiceNumber } from "@/lib/invoices/db";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@/lib/logger";
import { invoiceStatusSchema } from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

const listQuerySchema = z.object({
  status: invoiceStatusSchema.optional(),
  client_id: z.string().uuid().optional(),
  job_id: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const GET = withAuth(async (request, session) => {
  const { searchParams } = new URL(request.url);
  const parseResult = listQuerySchema.safeParse({
    status: searchParams.get("status") ?? undefined,
    client_id: searchParams.get("client_id") ?? undefined,
    job_id: searchParams.get("job_id") ?? undefined,
    page: searchParams.get("page") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });

  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid query parameters",
          details: { issues: parseResult.error.issues },
          traceId: session.traceId,
        },
      },
      { status: 400 }
    );
  }

  const { status, client_id, job_id, page, limit } = parseResult.data;
  const offset = (page - 1) * limit;

  try {
    const conditions: string[] = ["i.account_id = $1"];
    const params: unknown[] = [session.accountId];
    let idx = 2;

    if (status) {
      conditions.push(`i.status = $${idx++}`);
      params.push(status);
    }
    if (client_id) {
      conditions.push(`i.client_id = $${idx++}`);
      params.push(client_id);
    }
    if (job_id) {
      conditions.push(`i.job_id = $${idx++}`);
      params.push(job_id);
    }

    const where = conditions.join(" AND ");

    const countParams = [...params];
    const total = await withInvoiceContext(session, async (client) => {
      const r = await client.query<{ total: string }>(
        `SELECT COUNT(*) AS total FROM invoices i WHERE ${where}`,
        countParams
      );
      return parseInt(r.rows[0]?.total ?? "0", 10);
    });

    params.push(limit, offset);
    const rows = await withInvoiceContext(session, async (client) => {
      const r = await client.query(
        `SELECT i.id, i.status, i.invoice_number,
                i.subtotal_cents, i.tax_cents, i.total_cents, i.paid_cents,
                i.due_date, i.sent_at, i.paid_at, i.estimate_id,
                i.client_id, i.job_id, i.created_at, i.updated_at,
                c.name AS client_name
         FROM invoices i
         LEFT JOIN clients c ON c.id = i.client_id
         WHERE ${where}
         ORDER BY i.created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        params
      );
      return r.rows;
    });

    return NextResponse.json({
      data: rows,
      pagination: { page, limit, total },
    });
  } catch (error) {
    logger.error("GET /api/v1/invoices error", error, { traceId: session.traceId });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to fetch invoices",
          traceId: session.traceId,
        },
      },
      { status: 500 }
    );
  }
});

// === Create Invoice (POST /api/v1/invoices) ===

const lineItemInputSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unit_price_cents: z.number().int().nonnegative(),
  sort_order: z.number().int().default(0),
});

const createInvoiceSchema = z.object({
  client_id: z.string().uuid(),
  job_id: z.string().uuid().nullable().optional(),
  property_id: z.string().uuid().nullable().optional(),
  due_date: z.string().datetime().nullable().optional(),
  notes: z.string().nullable().optional(),
  tax_rate: z.number().min(0).max(100).default(0),
  line_items: z.array(lineItemInputSchema).default([]),
});

export const POST = withRole(["owner", "admin"], async (request, session) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid JSON body", traceId: session.traceId } },
      { status: 400 }
    );
  }

  const parseResult = createInvoiceSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: { issues: parseResult.error.issues },
          traceId: session.traceId,
        },
      },
      { status: 400 }
    );
  }

  const { client_id, job_id, property_id, due_date, notes, tax_rate, line_items } = parseResult.data;

  // Compute totals
  const subtotal_cents = line_items.reduce(
    (sum, item) => sum + Math.round(item.quantity * item.unit_price_cents),
    0
  );
  const tax_cents = Math.round((subtotal_cents * tax_rate) / 100);
  const total_cents = subtotal_cents + tax_cents;

  try {
    const invoice = await withInvoiceContext(session, async (client) => {
      // Verify client belongs to account
      const clientRow = await client.query(
        `SELECT id FROM clients WHERE id = $1 AND account_id = $2`,
        [client_id, session.accountId]
      );
      if (clientRow.rowCount === 0) {
        throw Object.assign(new Error("Client not found"), { code: "NOT_FOUND" });
      }

      const invoiceNumber = await generateInvoiceNumber(client, session.accountId);

      const result = await client.query<{ id: string }>(
        `INSERT INTO invoices
           (account_id, client_id, job_id, property_id,
            status, invoice_number,
            subtotal_cents, tax_cents, total_cents, paid_cents,
            notes, due_date, created_by)
         VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7, $8, 0, $9, $10, $11)
         RETURNING id`,
        [
          session.accountId,
          client_id,
          job_id ?? null,
          property_id ?? null,
          invoiceNumber,
          subtotal_cents,
          tax_cents,
          total_cents,
          notes ?? null,
          due_date ?? null,
          session.userId,
        ]
      );
      const invoiceId = result.rows[0].id;

      for (let i = 0; i < line_items.length; i++) {
        const item = line_items[i];
        await client.query(
          `INSERT INTO invoice_line_items
             (invoice_id, description, quantity, unit_price_cents, total_cents, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            invoiceId,
            item.description,
            item.quantity,
            item.unit_price_cents,
            Math.round(item.quantity * item.unit_price_cents),
            item.sort_order ?? i,
          ]
        );
      }

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "invoice",
        entity_id: invoiceId,
        action: "insert",
        actor_id: session.userId,
        trace_id: session.traceId,
        new_value: { client_id, invoice_number: invoiceNumber, total_cents },
      });

      return invoiceId;
    });

    return NextResponse.json({ id: invoice }, { status: 201 });
  } catch (error) {
    const err = error as Error & { code?: string };
    if (err.code === "NOT_FOUND") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Client not found", traceId: session.traceId } },
        { status: 404 }
      );
    }
    logger.error("POST /api/v1/invoices error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to create invoice", traceId: session.traceId } },
      { status: 500 }
    );
  }
});
