import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/middleware";
import { withInvoiceContext } from "@/lib/invoices/db";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@/lib/logger";
import {
  loadSquareSettings,
  createSquarePaymentLink,
} from "@/lib/integrations/square-payments";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  kind: z.enum(["deposit", "balance", "custom"]),
  amount_cents: z.number().int().positive().optional(),
});

// === POST /api/v1/invoices/[id]/square-link — create a Square payment link ===
// Creates a Square-hosted checkout link for the deposit, the remaining balance,
// or a custom amount. Saves the link + order id to the invoice and records a
// PENDING payment row; the webhook flips it to paid when the customer pays.

export const POST = withRole(["owner", "admin"], async (request, session) => {
  const invoiceId = request.nextUrl.pathname.split("/").at(-2)!;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid JSON body", traceId: session.traceId } },
      { status: 400 }
    );
  }

  const parsed = bodySchema.safeParse(raw);
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
  const { kind, amount_cents } = parsed.data;

  try {
    const result = await withInvoiceContext(session, async (client) => {
      const invoiceResult = await client.query<{
        id: string;
        status: string;
        invoice_number: string;
        total_cents: number;
        paid_cents: number;
        deposit_cents: number;
        balance_cents: number;
        client_id: string;
        job_id: string | null;
      }>(
        `SELECT id, status, invoice_number, total_cents, paid_cents,
                deposit_cents, balance_cents, client_id, job_id
         FROM invoices
         WHERE id = $1 AND account_id = $2
         FOR UPDATE`,
        [invoiceId, session.accountId]
      );
      if (invoiceResult.rowCount === 0) {
        throw Object.assign(new Error("Invoice not found"), { code: "NOT_FOUND" });
      }
      const invoice = invoiceResult.rows[0];

      if (!["sent", "partial", "overdue"].includes(invoice.status)) {
        throw Object.assign(
          new Error(`Cannot create a payment link for an invoice in "${invoice.status}" status`),
          { code: "INVALID_TRANSITION" }
        );
      }

      // Resolve amount + payment type from the requested kind.
      const remaining = Math.max(0, invoice.total_cents - invoice.paid_cents);
      let amount: number;
      let paymentType: "deposit" | "progress";
      if (kind === "deposit") {
        amount = invoice.deposit_cents;
        paymentType = "deposit";
        if (amount <= 0) {
          throw Object.assign(new Error("This invoice has no deposit amount"), { code: "VALIDATION_ERROR" });
        }
      } else if (kind === "balance") {
        amount = remaining;
        paymentType = "progress";
      } else {
        amount = amount_cents ?? 0;
        paymentType = "progress";
        if (amount <= 0) {
          throw Object.assign(new Error("A custom amount is required"), { code: "VALIDATION_ERROR" });
        }
      }
      if (amount > remaining) {
        throw Object.assign(
          new Error("Payment link amount exceeds the remaining balance"),
          { code: "VALIDATION_ERROR" }
        );
      }

      const settings = await loadSquareSettings(client, session.accountId);
      if (!settings || !settings.enabled) {
        throw Object.assign(new Error("Square is not enabled"), { code: "PRECONDITION_FAILED" });
      }
      if (!settings.secrets.accessToken || !settings.config.locationId) {
        throw Object.assign(
          new Error("Square access token and location ID must be configured"),
          { code: "PRECONDITION_FAILED" }
        );
      }

      const linkName = `${invoice.invoice_number} — ${kind === "deposit" ? "Deposit" : kind === "balance" ? "Balance" : "Payment"}`;
      const link = await createSquarePaymentLink(settings, {
        name: linkName,
        amountCents: amount,
        idempotencyKey: `${invoiceId}:${kind}:${amount}`,
      });

      // Save Square references on the invoice. square_* columns are not part of
      // the immutability guard, so this is allowed on payable invoices.
      await client.query(
        `UPDATE invoices
         SET square_order_id = $2, square_checkout_id = $3, square_payment_link_url = $4
         WHERE id = $1`,
        [invoiceId, link.orderId, link.paymentLinkId, link.url]
      );

      // Record a PENDING payment. external_payment_id stays NULL until the
      // webhook delivers the actual Square payment id (matched via order id).
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO payments
           (account_id, invoice_id, job_id, customer_id, amount_cents, method,
            payment_type, status, external_provider, external_checkout_url, created_by)
         VALUES ($1, $2, $3, $4, $5, 'square', $6, 'pending', 'square', $7, $8)
         RETURNING id`,
        [
          session.accountId,
          invoiceId,
          invoice.job_id,
          invoice.client_id,
          amount,
          paymentType,
          link.url,
          session.userId,
        ]
      );

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "payment",
        entity_id: inserted.rows[0].id,
        action: "insert",
        actor_id: session.userId,
        trace_id: session.traceId,
        new_value: {
          invoice_id: invoiceId,
          amount_cents: amount,
          method: "square",
          status: "pending",
          square_order_id: link.orderId,
        },
      });

      return {
        payment_id: inserted.rows[0].id,
        url: link.url,
        order_id: link.orderId,
        amount_cents: amount,
      };
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    const err = error as Error & { code?: string };
    const map: Record<string, number> = {
      NOT_FOUND: 404,
      INVALID_TRANSITION: 400,
      VALIDATION_ERROR: 400,
      PRECONDITION_FAILED: 412,
    };
    if (err.code && map[err.code]) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message, traceId: session.traceId } },
        { status: map[err.code] }
      );
    }
    logger.error("POST /api/v1/invoices/[id]/square-link error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to create payment link", traceId: session.traceId } },
      { status: 500 }
    );
  }
});
