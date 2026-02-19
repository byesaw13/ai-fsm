import { NextResponse } from "next/server";
import { withAuth, withRole } from "@/lib/auth/middleware";
import { withInvoiceContext } from "@/lib/invoices/db";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// === Get Invoice (GET /api/v1/invoices/[id]) ===

export const GET = withAuth(async (request, session) => {
  const id = request.nextUrl.pathname.split("/").at(-1)!;

  try {
    const data = await withInvoiceContext(session, async (client) => {
      const invoiceResult = await client.query(
        `SELECT i.id, i.status, i.invoice_number,
                i.subtotal_cents, i.tax_cents, i.total_cents, i.paid_cents,
                i.notes, i.due_date, i.sent_at, i.paid_at,
                i.estimate_id, i.client_id, i.job_id, i.property_id,
                i.created_by, i.created_at, i.updated_at,
                c.name AS client_name, j.title AS job_title
         FROM invoices i
         LEFT JOIN clients c ON c.id = i.client_id
         LEFT JOIN jobs j ON j.id = i.job_id
         WHERE i.id = $1 AND i.account_id = $2`,
        [id, session.accountId]
      );

      if (invoiceResult.rowCount === 0) return null;

      const lineItemsResult = await client.query(
        `SELECT id, invoice_id, estimate_line_item_id,
                description, quantity, unit_price_cents, total_cents, sort_order, created_at
         FROM invoice_line_items
         WHERE invoice_id = $1
         ORDER BY sort_order ASC, created_at ASC`,
        [id]
      );

      return {
        ...invoiceResult.rows[0],
        line_items: lineItemsResult.rows,
      };
    });

    if (!data) {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Invoice not found",
            traceId: session.traceId,
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ data });
  } catch (error) {
    logger.error("GET /api/v1/invoices/[id] error", error, { traceId: session.traceId });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to fetch invoice",
          traceId: session.traceId,
        },
      },
      { status: 500 }
    );
  }
});

// === Update Invoice (PATCH /api/v1/invoices/[id]) ===
// Only draft invoices may be updated via this endpoint.
// Paid/void are terminal; sent/partial/overdue only allow paid_cents changes (via payments).

export const PATCH = withRole(["owner", "admin"], async (request, session) => {
  const id = request.nextUrl.pathname.split("/").at(-1)!;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid JSON body",
          traceId: session.traceId,
        },
      },
      { status: 400 }
    );
  }

  try {
    await withInvoiceContext(session, async (client) => {
      const existing = await client.query<{ id: string; status: string }>(
        `SELECT id, status FROM invoices WHERE id = $1 AND account_id = $2`,
        [id, session.accountId]
      );

      if (existing.rowCount === 0) {
        throw Object.assign(new Error("Not found"), { code: "NOT_FOUND" });
      }

      const inv = existing.rows[0];

      if (inv.status !== "draft") {
        throw Object.assign(
          new Error(`Invoice in ${inv.status} state cannot be edited directly`),
          { code: "IMMUTABLE_ENTITY" }
        );
      }

      // Build SET clauses for draft update
      const setClauses: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      const allowed = ["notes", "due_date"] as const;
      for (const key of allowed) {
        if (key in body) {
          setClauses.push(`${key} = $${idx++}`);
          params.push(body[key] ?? null);
        }
      }

      if (setClauses.length > 0) {
        setClauses.push(`updated_at = now()`);
        params.push(id);
        await client.query(
          `UPDATE invoices SET ${setClauses.join(", ")} WHERE id = $${idx}`,
          params
        );
      }

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "invoice",
        entity_id: id,
        action: "update",
        actor_id: session.userId,
        trace_id: session.traceId,
        old_value: { status: inv.status },
        new_value: body,
      });
    });

    return NextResponse.json({ updated: true });
  } catch (error) {
    const err = error as Error & { code?: string };
    if (err.code === "NOT_FOUND") {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Invoice not found",
            traceId: session.traceId,
          },
        },
        { status: 404 }
      );
    }
    if (err.code === "IMMUTABLE_ENTITY") {
      return NextResponse.json(
        {
          error: {
            code: "IMMUTABLE_ENTITY",
            message: err.message,
            traceId: session.traceId,
          },
        },
        { status: 422 }
      );
    }
    logger.error("PATCH /api/v1/invoices/[id] error", error, { traceId: session.traceId });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to update invoice",
          traceId: session.traceId,
        },
      },
      { status: 500 }
    );
  }
});
