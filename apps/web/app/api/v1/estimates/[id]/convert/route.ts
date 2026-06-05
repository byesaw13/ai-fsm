import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/middleware";
import { appendAuditLog } from "@/lib/db/audit";
import { withInvoiceContext, generateInvoiceNumber } from "@/lib/invoices/db";
import { reconcileFinalInvoice } from "@/lib/invoices/billing";
import { logger } from "@/lib/logger";

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
                e.subtotal_cents, e.tax_cents, e.total_cents, e.deposit_cents,
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
        deposit_cents: number;
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

      // 3. Idempotency guard: only a prior FINAL invoice counts as "already
      //    converted". A deposit invoice (created on approval) must NOT short
      //    circuit this — otherwise Convert would return the deposit invoice
      //    and the real final invoice would never be created.
      const existingFinal = await client.query<{
        id: string;
        status: string;
      }>(
        `SELECT id, status FROM invoices
         WHERE estimate_id = $1 AND account_id = $2 AND invoice_kind = 'final'
         LIMIT 1`,
        [id, session.accountId]
      );

      if (existingFinal.rowCount !== null && existingFinal.rowCount > 0) {
        // Already converted — return existing final invoice (idempotent)
        return {
          invoice_id: existingFinal.rows[0].id,
          invoice_status: existingFinal.rows[0].status,
          created: false,
        };
      }

      // 3b. Reconcile against any deposit invoices already billed so the final
      //     invoice credits the deposit and the two never double-bill.
      const depositInvoices = await client.query<{
        invoice_number: string;
        total_cents: number;
        status: string;
      }>(
        `SELECT invoice_number, total_cents, status FROM invoices
         WHERE estimate_id = $1 AND account_id = $2 AND invoice_kind = 'deposit'`,
        [id, session.accountId]
      );

      const reconciliation = reconcileFinalInvoice({
        invoiceTotalCents: estimate.total_cents,
        depositInvoices: depositInvoices.rows,
      });

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

      // 6. Create the FINAL invoice as an immutable snapshot of the approved
      //    estimate. It carries the full project total; deposit_cents holds the
      //    deposit already billed so the generated balance_cents excludes it.
      const finalNotes = reconciliation.reconciliationNote
        ? `${estimate.notes ? `${estimate.notes}\n\n` : ""}${reconciliation.reconciliationNote}`
        : estimate.notes;

      const invoiceResult = await client.query<{ id: string }>(
        `INSERT INTO invoices
           (account_id, client_id, job_id, estimate_id, property_id,
            status, invoice_kind, invoice_number,
            subtotal_cents, tax_cents, total_cents, paid_cents, deposit_cents,
            notes, created_by)
         VALUES ($1, $2, $3, $4, $5,
                 'draft', 'final', $6,
                 $7, $8, $9, 0, $10,
                 $11, $12)
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
          reconciliation.depositCreditCents,
          finalNotes,
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
          invoice_kind: "final",
          total_cents: estimate.total_cents,
          deposit_credit_cents: reconciliation.depositCreditCents,
          balance_due_cents: reconciliation.balanceDueCents,
          line_item_count: lineItems.length,
        },
      });

      return {
        invoice_id: invoiceId,
        invoice_number: invoiceNumber,
        invoice_status: "draft",
        deposit_credit_cents: reconciliation.depositCreditCents,
        balance_due_cents: reconciliation.balanceDueCents,
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

    logger.error("POST /api/v1/estimates/[id]/convert error", error, { traceId: session.traceId });
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
