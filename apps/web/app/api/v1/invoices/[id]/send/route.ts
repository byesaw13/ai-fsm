import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/middleware";
import { withInvoiceContext } from "@/lib/invoices/db";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@/lib/logger";
import { sendEmail, appUrl, isEmailConfigured } from "@/lib/email/mailer";
import { invoiceEmailHtml, invoiceEmailText } from "@ai-fsm/email-templates";
import { logCommunication } from "@/lib/communications-log";
import { loadInvoicePdf } from "@/lib/pdf/load";

export const dynamic = "force-dynamic";

export const POST = withRole(["owner", "admin"], async (request, session) => {
  const id = request.nextUrl.pathname.split("/").at(-2)!;

  try {
    const result = await withInvoiceContext(session, async (client) => {
      const { rows, rowCount } = await client.query(
        `SELECT i.id, i.status, i.invoice_number, i.total_cents, i.balance_cents,
                i.deposit_cents, i.due_date, i.notes, i.sent_at, i.paid_at, i.share_token,
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
        paid_at: string | null; share_token: string;
        client_id: string; client_name: string; client_email: string | null;
      };

      // Void invoices stay blocked. Paid invoices are allowed so staff can email
      // a final PDF receipt even when the client never uses the portal.
      if (inv.status === "void") {
        return { status: 422, message: "Cannot send a void invoice" };
      }

      if (!inv.client_email) {
        return { status: 422, message: "Client has no email address on file" };
      }

      if (!isEmailConfigured()) {
        return { status: 503, message: "Email is not configured on this server" };
      }

      const isPaid = inv.status === "paid";

      // Public share link (no login). PDF attachment is the offline artifact.
      const viewUrl = `${appUrl()}/portal/invoices/${inv.share_token}`;
      const dueDateStr = inv.due_date
        ? new Date(inv.due_date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
        : null;
      const paidAtStr = inv.paid_at
        ? new Date(inv.paid_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
        : null;

      // Attach the invoice as a PDF (best-effort: a render failure must not
      // block the notification email from going out). Critical for paid
      // receipts when clients don't open the portal.
      let pdf: Awaited<ReturnType<typeof loadInvoicePdf>> = null;
      try {
        pdf = await loadInvoicePdf(client, session.accountId, id);
      } catch (err) {
        logger.warn("[invoices/send] PDF render failed; sending without attachment", {
          invoiceId: id,
          error: (err as Error).message,
        });
      }

      const subject = isPaid
        ? `Receipt — Invoice ${inv.invoice_number} from Dovetails Services LLC`
        : `Invoice ${inv.invoice_number} from Dovetails Services LLC`;

      const emailResult = await sendEmail({
        to: inv.client_email,
        subject,
        html: invoiceEmailHtml({
          invoiceNumber: inv.invoice_number,
          clientName: inv.client_name,
          totalCents: inv.total_cents,
          balanceCents: isPaid ? 0 : inv.balance_cents,
          dueDateStr: isPaid ? null : dueDateStr,
          viewUrl,
          notes: inv.notes,
          isPaid,
          paidAtStr,
        }),
        text: invoiceEmailText({
          invoiceNumber: inv.invoice_number,
          clientName: inv.client_name,
          totalCents: inv.total_cents,
          balanceCents: isPaid ? 0 : inv.balance_cents,
          dueDateStr: isPaid ? null : dueDateStr,
          viewUrl,
          notes: inv.notes,
          isPaid,
          paidAtStr,
        }),
        attachments: pdf
          ? [{ filename: pdf.filename, content: pdf.bytes, contentType: "application/pdf" }]
          : undefined,
      });

      if (!emailResult.ok) {
        await logCommunication({
          accountId: session.accountId,
          channel: "email",
          direction: "outbound",
          outcome: "failed",
          clientId: inv.client_id,
          bodyPreview: subject,
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
        bodyPreview: subject,
        initiatedBy: session.userId,
      });

      // Only the draft→sent transition writes sent_at. The invoice
      // immutability invariant (migration 004) forbids changing sent_at once
      // the invoice has left draft (sent/partial/overdue/paid), so a re-send
      // or paid receipt must not touch it — the send is recorded via the
      // communications + audit log.
      if (inv.status === "draft") {
        await client.query(
          `UPDATE invoices SET status = 'sent', sent_at = now(), updated_at = now() WHERE id = $1`,
          [id]
        );
      }

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "invoice",
        entity_id: id,
        action: "update",
        actor_id: session.userId,
        trace_id: session.traceId,
        old_value: { status: inv.status, sent_at: inv.sent_at },
        new_value: {
          sent_to: inv.client_email,
          status: inv.status === "draft" ? "sent" : inv.status,
          kind: isPaid ? "paid_receipt" : "invoice",
        },
      });

      return { status: 200, sentTo: inv.client_email, isPaid };
    });

    if (result.status === 404) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Invoice not found" } }, { status: 404 });
    }
    if (result.status !== 200) {
      return NextResponse.json({ error: { code: "SEND_ERROR", message: result.message } }, { status: result.status });
    }

    return NextResponse.json({ sent: true, sentTo: result.sentTo, isPaid: result.isPaid });
  } catch (error) {
    logger.error("POST /api/v1/invoices/[id]/send error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to send invoice", traceId: session.traceId } },
      { status: 500 }
    );
  }
});
