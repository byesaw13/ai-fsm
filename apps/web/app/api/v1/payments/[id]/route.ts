import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/middleware";
import { withInvoiceContext } from "@/lib/invoices/db";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// === Delete Payment (DELETE /api/v1/payments/[id]) ===
// Owner-only. Deletes the payment and recalculates invoice paid_cents.
// Note: The DB trigger only fires on INSERT. Deletion requires manual recalculation.

export const DELETE = withRole(["owner"], async (request, session) => {
  const paymentId = request.nextUrl.pathname.split("/").at(-1)!;

  try {
    await withInvoiceContext(session, async (client) => {
      // Fetch the payment to get invoice_id
      const paymentResult = await client.query<{
        id: string;
        invoice_id: string;
        amount_cents: number;
        method: string;
      }>(
        `SELECT id, invoice_id, amount_cents, method
         FROM payments
         WHERE id = $1 AND account_id = $2`,
        [paymentId, session.accountId]
      );

      if (paymentResult.rowCount === 0) {
        throw Object.assign(new Error("Payment not found"), {
          code: "NOT_FOUND",
        });
      }

      const payment = paymentResult.rows[0];

      // Fetch current invoice state before deletion
      const invoiceBefore = await client.query<{
        status: string;
        paid_cents: number;
        total_cents: number;
      }>(
        `SELECT status, paid_cents, total_cents
         FROM invoices WHERE id = $1 FOR UPDATE`,
        [payment.invoice_id]
      );

      if (invoiceBefore.rowCount === 0) {
        throw Object.assign(new Error("Invoice not found"), {
          code: "NOT_FOUND",
        });
      }

      const invBefore = invoiceBefore.rows[0];

      // Don't allow deletion if invoice is paid or void (terminal states)
      if (invBefore.status === "paid" || invBefore.status === "void") {
        throw Object.assign(
          new Error(
            `Cannot delete payment on invoice with terminal status "${invBefore.status}"`
          ),
          { code: "IMMUTABLE_ENTITY" }
        );
      }

      // Delete the payment
      await client.query(`DELETE FROM payments WHERE id = $1`, [paymentId]);

      // Recalculate paid_cents from remaining payments
      const sumResult = await client.query<{ total_paid: string }>(
        `SELECT COALESCE(SUM(amount_cents), 0) AS total_paid
         FROM payments WHERE invoice_id = $1`,
        [payment.invoice_id]
      );

      const newPaidCents = parseInt(sumResult.rows[0].total_paid, 10);

      // Derive new status
      let newStatus: string;
      if (newPaidCents >= invBefore.total_cents) {
        newStatus = "paid";
      } else if (newPaidCents > 0) {
        newStatus = "partial";
      } else {
        // No payments remaining — revert to sent (the pre-payment state)
        newStatus = "sent";
      }

      // Update invoice
      await client.query(
        `UPDATE invoices SET paid_cents = $1, status = $2, paid_at = $3, updated_at = now()
         WHERE id = $4`,
        [
          newPaidCents,
          newStatus,
          newStatus === "paid" ? new Date().toISOString() : null,
          payment.invoice_id,
        ]
      );

      // Audit log for payment deletion
      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "payment",
        entity_id: paymentId,
        action: "delete",
        actor_id: session.userId,
        trace_id: session.traceId,
        old_value: {
          invoice_id: payment.invoice_id,
          amount_cents: payment.amount_cents,
          method: payment.method,
        },
      });

      // Audit log for invoice status change
      if (newStatus !== invBefore.status) {
        await appendAuditLog(client, {
          account_id: session.accountId,
          entity_type: "invoice",
          entity_id: payment.invoice_id,
          action: "update",
          actor_id: session.userId,
          trace_id: session.traceId,
          old_value: {
            status: invBefore.status,
            paid_cents: invBefore.paid_cents,
          },
          new_value: {
            status: newStatus,
            paid_cents: newPaidCents,
          },
        });
      }
    });

    return NextResponse.json({ deleted: true });
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
    logger.error("DELETE /api/v1/payments/[id] error", error, { traceId: session.traceId });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to delete payment",
          traceId: session.traceId,
        },
      },
      { status: 500 }
    );
  }
});
