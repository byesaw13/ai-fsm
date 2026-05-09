import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/middleware";
import { withInvoiceContext } from "@/lib/invoices/db";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@/lib/logger";
import { sendEmail, appUrl, isEmailConfigured } from "@/lib/email/mailer";
import { invoiceEmailHtml, invoiceEmailText } from "@/lib/email/templates";
import { logCommunication } from "@/lib/communications-log";

export const dynamic = "force-dynamic";

export const POST = withRole(["owner", "admin"], async (request, session) => {
  const id = request.nextUrl.pathname.split("/").at(-2)!;

  try {
    const result = await withInvoiceContext(session, async (client) => {
      const { rows, rowCount } = await client.query(
        `SELECT i.id, i.status, i.invoice_number, i.total_cents, i.balance_cents,
                i.deposit_cents, i.due_date, i.notes, i.sent_at,
                c.id AS client_id, c.name AS client_name, c.email AS client_email
         FROM invoices i
         JOIN clients c ON c.id = i.client_id
         WHERE i.id = $1 AND i.account_id = $2`,
        [id, session.accountId]
      );

      if (!rowCount || rowCount === 0) return { status: 404 };

      const inv = rows[0] as {
        id: string; status: string; invoice_number: string;
        total_cents: number; balance_cents: number; deposit_cents: number;
        due_date: string | null; notes: string | null; sent_at: string | null;
        client_id: string; client_name: string; client_email: string | null;
      };

      if (["paid", "void"].includes(inv.status)) {
        return { status: 422, message: `Cannot send a ${inv.status} invoice` };
      }

      if (!inv.client_email) {
        return { status: 422, message: "Client has no email address on file" };
      }

      if (!isEmailConfigured()) {
        return { status: 503, message: "Email is not configured on this server" };
      }

      const viewUrl = `${appUrl()}/app/invoices/${id}`;
      const dueDateStr = inv.due_date
        ? new Date(inv.due_date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
        : null;

      const emailResult = await sendEmail({
        to: inv.client_email,
        subject: `Invoice ${inv.invoice_number} from Dovetails Services LLC`,
        html: invoiceEmailHtml({
          invoiceNumber: inv.invoice_number,
          clientName: inv.client_name,
          totalCents: inv.total_cents,
          balanceCents: inv.balance_cents,
          dueDateStr,
          viewUrl,
          notes: inv.notes,
        }),
        text: invoiceEmailText({
          invoiceNumber: inv.invoice_number,
          clientName: inv.client_name,
          totalCents: inv.total_cents,
          balanceCents: inv.balance_cents,
          dueDateStr,
          viewUrl,
          notes: inv.notes,
        }),
      });

      if (!emailResult.ok) {
        await logCommunication({
          accountId: session.accountId,
          channel: "email",
          direction: "outbound",
          outcome: "failed",
          clientId: inv.client_id,
          bodyPreview: `Invoice ${inv.invoice_number} from Dovetails Services LLC`,
          initiatedBy: session.userId,
          externalId: emailResult.error ?? null,
        });
        return { status: 502, message: `Email send failed: ${emailResult.error}` };
      }

      await logCommunication({
        accountId: session.accountId,
        channel: "email",
        direction: "outbound",
        outcome: "sent",
        clientId: inv.client_id,
        bodyPreview: `Invoice ${inv.invoice_number} from Dovetails Services LLC`,
        initiatedBy: session.userId,
      });

      // If draft, transition to sent; otherwise just update sent_at timestamp
      const setClauses = inv.status === "draft"
        ? "status = 'sent', sent_at = now(), updated_at = now()"
        : "sent_at = now(), updated_at = now()";

      await client.query(
        `UPDATE invoices SET ${setClauses} WHERE id = $1`,
        [id]
      );

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "invoice",
        entity_id: id,
        action: "update",
        actor_id: session.userId,
        trace_id: session.traceId,
        old_value: { status: inv.status, sent_at: inv.sent_at },
        new_value: { sent_to: inv.client_email, status: inv.status === "draft" ? "sent" : inv.status },
      });

      return { status: 200, sentTo: inv.client_email };
    });

    if (result.status === 404) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Invoice not found" } }, { status: 404 });
    }
    if (result.status !== 200) {
      return NextResponse.json({ error: { code: "SEND_ERROR", message: result.message } }, { status: result.status });
    }

    return NextResponse.json({ sent: true, sentTo: result.sentTo });
  } catch (error) {
    logger.error("POST /api/v1/invoices/[id]/send error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to send invoice", traceId: session.traceId } },
      { status: 500 }
    );
  }
});
