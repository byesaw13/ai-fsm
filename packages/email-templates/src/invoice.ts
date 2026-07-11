import { formatCents } from "@ai-fsm/money";
import { BRAND, btn, wrap } from "./layout.js";
import type { InvoiceEmailData, InvoiceFollowupEmailData } from "./types.js";

export function invoiceEmailHtml(d: InvoiceEmailData): string {
  if (d.isPaid) {
    const paidRow = d.paidAtStr
      ? `<tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Paid on:</td><td style="padding:4px 0;font-size:13px;">${d.paidAtStr}</td></tr>`
      : "";
    return wrap(`
    <h2 style="margin:0 0 8px;font-size:22px;color:#0f172a;">Receipt — Invoice ${d.invoiceNumber}</h2>
    <p style="margin:0 0 24px;color:#52525b;font-size:15px;">Hi ${d.clientName}, thank you — this invoice is paid in full. A PDF copy is attached for your records.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Invoice #:</td><td style="padding:4px 0;font-weight:600;font-size:13px;">${d.invoiceNumber}</td></tr>
      <tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Total paid:</td><td style="padding:4px 0;font-weight:700;font-size:15px;color:#166534;">${formatCents(d.totalCents)}</td></tr>
      <tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Balance due:</td><td style="padding:4px 0;font-weight:600;font-size:13px;">${formatCents(0)}</td></tr>
      ${paidRow}
    </table>
    ${d.notes ? `<p style="margin:0 0 24px;padding:12px;background:#f4f4f5;border-radius:6px;font-size:13px;color:#52525b;">${d.notes}</p>` : ""}
    <p>${btn(d.viewUrl, "View Receipt Online")}</p>
    <p style="margin:16px 0 0;font-size:12px;color:#a1a1aa;">No portal login required — open the attached PDF, or use the link above for a web copy. Contact us if you have any questions.</p>
  `);
  }

  const dueRow = d.dueDateStr
    ? `<tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Due date:</td><td style="padding:4px 0;font-size:13px;">${d.dueDateStr}</td></tr>`
    : "";
  return wrap(`
    <h2 style="margin:0 0 8px;font-size:22px;color:#0f172a;">Invoice ${d.invoiceNumber}</h2>
    <p style="margin:0 0 24px;color:#52525b;font-size:15px;">Hi ${d.clientName}, please find your invoice details below. A PDF copy is attached for your records.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Invoice #:</td><td style="padding:4px 0;font-weight:600;font-size:13px;">${d.invoiceNumber}</td></tr>
      <tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Total:</td><td style="padding:4px 0;font-weight:600;font-size:13px;">${formatCents(d.totalCents)}</td></tr>
      <tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Balance due:</td><td style="padding:4px 0;font-weight:700;font-size:15px;color:#0f172a;">${formatCents(d.balanceCents)}</td></tr>
      ${dueRow}
    </table>
    ${d.notes ? `<p style="margin:0 0 24px;padding:12px;background:#f4f4f5;border-radius:6px;font-size:13px;color:#52525b;">${d.notes}</p>` : ""}
    <p>${btn(d.viewUrl, "View Invoice")}</p>
    <p style="margin:16px 0 0;font-size:12px;color:#a1a1aa;">No portal login required — open the attached PDF, or use the link above. To pay or discuss this invoice, please contact us directly.</p>
  `);
}

export function invoiceEmailText(d: InvoiceEmailData): string {
  if (d.isPaid) {
    return (
      `Receipt — Invoice ${d.invoiceNumber}\n\n` +
      `Hi ${d.clientName},\n\n` +
      `Thank you — this invoice is paid in full. A PDF copy is attached for your records.\n\n` +
      `Total paid: ${formatCents(d.totalCents)}\n` +
      `Balance due: ${formatCents(0)}` +
      (d.paidAtStr ? `\nPaid on: ${d.paidAtStr}` : "") +
      (d.notes ? `\n\nNotes: ${d.notes}` : "") +
      `\n\nView online: ${d.viewUrl}\n\n${BRAND}`
    );
  }

  return (
    `Invoice ${d.invoiceNumber}\n\n` +
    `Hi ${d.clientName},\n\n` +
    `A PDF copy is attached for your records.\n\n` +
    `Total: ${formatCents(d.totalCents)}\n` +
    `Balance due: ${formatCents(d.balanceCents)}` +
    (d.dueDateStr ? `\nDue: ${d.dueDateStr}` : "") +
    (d.notes ? `\n\nNotes: ${d.notes}` : "") +
    `\n\nView: ${d.viewUrl}\n\n${BRAND}`
  );
}

export function invoiceFollowupEmailHtml(d: InvoiceFollowupEmailData): string {
  return wrap(`
    <h2 style="margin:0 0 8px;font-size:22px;color:#dc2626;">Payment Reminder</h2>
    <p style="margin:0 0 24px;color:#52525b;font-size:15px;">Hi ${d.clientName}, your invoice is now ${d.daysOverdue} day${d.daysOverdue !== 1 ? "s" : ""} overdue. Please arrange payment at your earliest convenience.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Invoice #:</td><td style="padding:4px 0;font-size:13px;font-weight:600;">${d.invoiceNumber}</td></tr>
      <tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Total:</td><td style="padding:4px 0;font-size:13px;">${formatCents(d.totalCents)}</td></tr>
      <tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Balance due:</td><td style="padding:4px 0;font-weight:700;font-size:15px;color:#dc2626;">${formatCents(d.balanceCents)}</td></tr>
    </table>
    <p>${btn(d.viewUrl, "View Invoice")}</p>
    <p style="margin:16px 0 0;font-size:12px;color:#a1a1aa;">Please contact us if you have any questions about this invoice.</p>
  `);
}
