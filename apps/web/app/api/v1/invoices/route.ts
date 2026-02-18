import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import { withInvoiceContext } from "@/lib/invoices/db";
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
    console.error("GET /api/v1/invoices error:", error);
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
