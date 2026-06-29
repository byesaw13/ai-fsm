import { NextResponse } from "next/server";
import { withAuth, withRole } from "@/lib/auth/middleware";
import { withInvoiceContext } from "@/lib/invoices/db";
import { appendAuditLog } from "@/lib/db/audit";
import { paymentMethodSchema, paymentTypeSchema } from "@ai-fsm/domain";
import { validatePaymentAmount } from "@/lib/invoices/payments";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { writeWorkflowEvent } from "@/lib/workflow-events";

export const dynamic = "force-dynamic";

const recordPaymentSchema = z.object({
  amount_cents: z.number().int().positive(),
  method: paymentMethodSchema,
  payment_type: paymentTypeSchema.default("progress"),
  received_at: z.string().datetime().optional(),
  notes: z.string().nullable().optional(),
  idempotency_key: z.string().min(1).max(128).optional(),
});

// === List Payments (GET /api/v1/invoices/[id]/payments) ===

export const GET = withAuth(async (request, session) => {
  const invoiceId = request.nextUrl.pathname.split("/").at(-2)!;

  try {
    const data = await withInvoiceContext(session, async (client) => {
      // Verify invoice exists and belongs to account
      const invoiceCheck = await client.query(
        `SELECT id FROM invoices WHERE id = $1 AND account_id = $2`,
        [invoiceId, session.accountId]
      );
      if (invoiceCheck.rowCount === 0) return null;

      const result = await client.query(
        `SELECT p.id, p.invoice_id, p.amount_cents, p.method,
                p.payment_type, p.status, p.external_provider, p.paid_at,
                p.received_at, p.notes, p.created_by, p.created_at,
                u.full_name AS created_by_name
         FROM payments p
         LEFT JOIN users u ON u.id = p.created_by
         WHERE p.invoice_id = $1 AND p.account_id = $2
         ORDER BY p.received_at DESC, p.created_at DESC`,
        [invoiceId, session.accountId]
      );

      return result.rows;
    });

    if (data === null) {
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
    logger.error("GET /api/v1/invoices/[id]/payments error", error, { traceId: session.traceId });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to fetch payments",
          traceId: session.traceId,
        },
      },
      { status: 500 }
    );
  }
});

// === Record Payment (POST /api/v1/invoices/[id]/payments) ===
// Inserts a payment row. The DB trigger `trg_payment_sync_invoice` automatically
// recalculates invoice.paid_cents and transitions status (partial → paid).

export const POST = withRole(["owner", "admin"], async (request, session) => {
  const invoiceId = request.nextUrl.pathname.split("/").at(-2)!;

  let body: unknown;
  try {
    body = await request.json();
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

  const parsed = recordPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: { issues: parsed.error.issues },
          traceId: session.traceId,
        },
      },
      { status: 400 }
    );
  }

  const { amount_cents, method, payment_type, received_at, notes, idempotency_key } =
    parsed.data;

  try {
    const result = await withInvoiceContext(session, async (client) => {
      // Fetch and lock the invoice
      const invoiceResult = await client.query<{
        id: string;
        status: string;
        total_cents: number;
        paid_cents: number;
        client_id: string;
        job_id: string | null;
      }>(
        `SELECT id, status, total_cents, paid_cents, client_id, job_id
         FROM invoices
         WHERE id = $1 AND account_id = $2
         FOR UPDATE`,
        [invoiceId, session.accountId]
      );

      if (invoiceResult.rowCount === 0) {
        throw Object.assign(new Error("Invoice not found"), {
          code: "NOT_FOUND",
        });
      }

      const invoice = invoiceResult.rows[0];

      // Only allow payments on payable invoices
      // Refunds are ledger-only records: they may apply to a fully-paid
      // invoice and are not bounded by the remaining balance. Crediting
      // payments (deposit/progress/final/adjustment) keep the original guards.
      const isRefund = payment_type === "refund";

      if (!isRefund) {
        const payableStatuses = ["sent", "partial", "overdue"];
        if (!payableStatuses.includes(invoice.status)) {
          throw Object.assign(
            new Error(
              `Cannot record payment on invoice with status "${invoice.status}"`
            ),
            { code: "INVALID_TRANSITION" }
          );
        }

        // Validate amount
        const amountError = validatePaymentAmount(
          amount_cents,
          invoice.total_cents,
          invoice.paid_cents
        );
        if (amountError) {
          throw Object.assign(new Error(amountError), {
            code: "VALIDATION_ERROR",
          });
        }
      }

      // Idempotency check: if idempotency_key is provided, check for duplicate
      if (idempotency_key) {
        const existing = await client.query<{ id: string }>(
          `SELECT id FROM payments
           WHERE invoice_id = $1 AND account_id = $2
             AND notes LIKE $3`,
          [
            invoiceId,
            session.accountId,
            `[idem:${idempotency_key}]%`,
          ]
        );
        if (existing.rowCount && existing.rowCount > 0) {
          // Return existing payment — idempotent
          return { payment_id: existing.rows[0].id, created: false };
        }
      }

      // Deterministic duplicate guard: same invoice, amount, method within 60 seconds
      const dupCheck = await client.query<{ id: string }>(
        `SELECT id FROM payments
         WHERE invoice_id = $1 AND account_id = $2
           AND amount_cents = $3 AND method = $4
           AND created_at > now() - interval '60 seconds'`,
        [invoiceId, session.accountId, amount_cents, method]
      );
      if (dupCheck.rowCount && dupCheck.rowCount > 0) {
        throw Object.assign(
          new Error(
            "Duplicate payment detected. A payment with the same amount and method was recorded within the last 60 seconds."
          ),
          { code: "CONFLICT" }
        );
      }

      // Insert payment — DB trigger handles invoice.paid_cents + status
      const notesValue = idempotency_key
        ? `[idem:${idempotency_key}]${notes ?? ""}`
        : notes ?? null;

      // Manual entries record a completed payment; refunds are tracked as
      // their own rows with status 'refunded' (they do not credit the invoice).
      const paymentStatus = payment_type === "refund" ? "refunded" : "paid";
      const paidAt =
        paymentStatus === "paid"
          ? received_at ?? new Date().toISOString()
          : null;

      const insertResult = await client.query<{ id: string }>(
        `INSERT INTO payments
           (account_id, invoice_id, job_id, customer_id, amount_cents, method,
            payment_type, status, received_at, paid_at, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id`,
        [
          session.accountId,
          invoiceId,
          invoice.job_id,
          invoice.client_id,
          amount_cents,
          method,
          payment_type,
          paymentStatus,
          received_at ?? new Date().toISOString(),
          paidAt,
          notesValue,
          session.userId,
        ]
      );

      const paymentId = insertResult.rows[0].id;

      // Fetch updated invoice to return new status
      const updatedInvoice = await client.query<{
        status: string;
        paid_cents: number;
        total_cents: number;
      }>(
        `SELECT status, paid_cents, total_cents FROM invoices WHERE id = $1`,
        [invoiceId]
      );

      // Audit log for payment creation
      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "payment",
        entity_id: paymentId,
        action: "insert",
        actor_id: session.userId,
        trace_id: session.traceId,
        new_value: {
          invoice_id: invoiceId,
          amount_cents,
          method,
          payment_type,
          received_at: received_at ?? "now",
        },
      });

      // Daily Operations Log / timeline: every payment is an event.
      await writeWorkflowEvent(client, {
        accountId: session.accountId,
        eventType: "payment.recorded",
        entityType: "payment",
        entityId: paymentId,
        payload: {
          invoiceId,
          jobId: invoice.job_id,
          clientId: invoice.client_id,
          amountCents: amount_cents,
          method,
          paymentType: payment_type,
        },
      });

      // Audit log for invoice status change (if it changed)
      const newInv = updatedInvoice.rows[0];
      if (newInv.status !== invoice.status) {
        await appendAuditLog(client, {
          account_id: session.accountId,
          entity_type: "invoice",
          entity_id: invoiceId,
          action: "update",
          actor_id: session.userId,
          trace_id: session.traceId,
          old_value: {
            status: invoice.status,
            paid_cents: invoice.paid_cents,
          },
          new_value: {
            status: newInv.status,
            paid_cents: newInv.paid_cents,
          },
        });

        if (newInv.status === "paid") {
          await writeWorkflowEvent(client, {
            accountId: session.accountId,
            eventType: "invoice.paid",
            entityType: "invoice",
            entityId: invoiceId,
            payload: { amountCents: amount_cents, method },
          });
        }
      }

      return {
        payment_id: paymentId,
        created: true,
        invoice_status: newInv.status,
        invoice_paid_cents: newInv.paid_cents,
        invoice_total_cents: newInv.total_cents,
      };
    });

    const status = result.created ? 201 : 200;
    return NextResponse.json({ data: result }, { status });
  } catch (error) {
    const err = error as Error & { code?: string };
    if (err.code === "NOT_FOUND") {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: err.message,
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
    if (err.code === "VALIDATION_ERROR") {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: err.message,
            traceId: session.traceId,
          },
        },
        { status: 400 }
      );
    }
    if (err.code === "CONFLICT") {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: err.message,
            traceId: session.traceId,
          },
        },
        { status: 409 }
      );
    }
    // Handle PG trigger rejections
    if ((err as Error & { code?: string }).code === "P0001") {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_TRANSITION",
            message:
              (err as Error).message || "Payment violates invoice constraints",
            traceId: session.traceId,
          },
        },
        { status: 400 }
      );
    }
    logger.error("POST /api/v1/invoices/[id]/payments error", error, { traceId: session.traceId });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to record payment",
          traceId: session.traceId,
        },
      },
      { status: 500 }
    );
  }
});
