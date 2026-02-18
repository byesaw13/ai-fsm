import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/middleware";
import { appendAuditLog } from "@/lib/db/audit";
import { withInvoiceContext, generateInvoiceNumber } from "@/lib/invoices/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/estimates/[id]/convert
 *
 * Convert an approved estimate into a draft invoice (immutable snapshot).
 *
 * Business rules:
 * - Estimate must be in `approved` status
 * - Only owner/admin may convert
 * - Idempotent: repeated calls return the existing invoice (no duplicates)
 * - Line items copied with estimate_line_item_id FK for traceability
 * - Totals snapshotted in cents at conversion time
 * - Audit record written on first conversion
 *
 * Source evidence:
 *   Dovelite: estimate-to-invoice conversion UX pattern (button on approved estimate detail)
 *   Myprogram: invariant discipline — immutable snapshot, no mutation after creation
 *   AI-FSM: db/migrations/001_core_schema.sql (invoices.estimate_id FK, line_items.estimate_line_item_id FK)
 */
export const POST = withRole(["owner", "admin"], async (request, session) => {
  const id = request.nextUrl.pathname.split("/").at(-2)!;

  try {
    const result = await withInvoiceContext(session, async (client) => {
      // 1. Fetch estimate with line items
      const estimateResult = await client.query(
        `SELECT e.id, e.status, e.client_id, e.job_id, e.property_id,
                e.subtotal_cents, e.tax_cents, e.total_cents,
                e.notes, e.created_by
         FROM estimates e
         WHERE e.id = $1 AND e.account_id = $2`,
        [id, session.accountId]
      );

      if (estimateResult.rowCount === 0) {
        throw Object.assign(new Error("Estimate not found"), {
          code: "NOT_FOUND",
        });
      }

      const estimate = estimateResult.rows[0] as {
        id: string;
        status: string;
        client_id: string;
        job_id: string | null;
        property_id: string | null;
        subtotal_cents: number;
        tax_cents: number;
        total_cents: number;
        notes: string | null;
        created_by: string;
      };

      // 2. Enforce prerequisite: only approved estimates can be converted
      if (estimate.status !== "approved") {
        throw Object.assign(
          new Error(
            `Only approved estimates can be converted to invoices (current status: ${estimate.status})`
          ),
          { code: "INVALID_TRANSITION" }
        );
      }

      // 3. Idempotency guard: check if an invoice already exists for this estimate
      const existingInvoice = await client.query<{
        id: string;
        status: string;
      }>(
        `SELECT id, status FROM invoices
         WHERE estimate_id = $1 AND account_id = $2
         LIMIT 1`,
        [id, session.accountId]
      );

      if (existingInvoice.rowCount !== null && existingInvoice.rowCount > 0) {
        // Already converted — return existing invoice (idempotent)
        return {
          invoice_id: existingInvoice.rows[0].id,
          invoice_status: existingInvoice.rows[0].status,
          created: false,
        };
      }

      // 4. Fetch estimate line items for copying
      const lineItemsResult = await client.query(
        `SELECT id, description, quantity, unit_price_cents, total_cents, sort_order
         FROM estimate_line_items
         WHERE estimate_id = $1
         ORDER BY sort_order ASC, created_at ASC`,
        [id]
      );
      const lineItems = lineItemsResult.rows as Array<{
        id: string;
        description: string;
        quantity: number;
        unit_price_cents: number;
        total_cents: number;
        sort_order: number;
      }>;

      // 5. Generate unique invoice number (inside transaction to avoid race)
      const invoiceNumber = await generateInvoiceNumber(
        client,
        session.accountId
      );

      // 6. Create invoice as immutable snapshot of approved estimate
      const invoiceResult = await client.query<{ id: string }>(
        `INSERT INTO invoices
           (account_id, client_id, job_id, estimate_id, property_id,
            status, invoice_number,
            subtotal_cents, tax_cents, total_cents, paid_cents,
            notes, created_by)
         VALUES ($1, $2, $3, $4, $5,
                 'draft', $6,
                 $7, $8, $9, 0,
                 $10, $11)
         RETURNING id`,
        [
          session.accountId,
          estimate.client_id,
          estimate.job_id,
          id, // estimate_id FK
          estimate.property_id,
          invoiceNumber,
          estimate.subtotal_cents,
          estimate.tax_cents,
          estimate.total_cents,
          estimate.notes,
          session.userId,
        ]
      );
      const invoiceId = invoiceResult.rows[0].id;

      // 7. Copy line items with traceability FK (estimate_line_item_id)
      for (const item of lineItems) {
        await client.query(
          `INSERT INTO invoice_line_items
             (invoice_id, estimate_line_item_id, description, quantity, unit_price_cents, total_cents, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            invoiceId,
            item.id,
            item.description,
            item.quantity,
            item.unit_price_cents,
            item.total_cents,
            item.sort_order,
          ]
        );
      }

      // 8. Audit log the conversion event
      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "invoice",
        entity_id: invoiceId,
        action: "insert",
        actor_id: session.userId,
        trace_id: session.traceId,
        new_value: {
          source: "estimate_conversion",
          estimate_id: id,
          invoice_number: invoiceNumber,
          total_cents: estimate.total_cents,
          line_item_count: lineItems.length,
        },
      });

      return {
        invoice_id: invoiceId,
        invoice_number: invoiceNumber,
        invoice_status: "draft",
        created: true,
      };
    });

    return NextResponse.json(result, {
      status: result.created ? 201 : 200,
    });
  } catch (error) {
    const err = error as Error & { code?: string };

    if (err.code === "NOT_FOUND") {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Estimate not found",
            traceId: session.traceId,
          },
        },
        { status: 404 }
      );
    }

    if (err.code === "INVALID_TRANSITION") {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_TRANSITION",
            message: err.message,
            traceId: session.traceId,
          },
        },
        { status: 400 }
      );
    }

    console.error("POST /api/v1/estimates/[id]/convert error:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to convert estimate to invoice",
          traceId: session.traceId,
        },
      },
      { status: 500 }
    );
  }
});
