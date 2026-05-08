/** Shared HTML email templates. Keep simple — no external CSS, inline styles only. */

const BRAND = "Dovetails Services LLC";

function wrap(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,sans-serif;color:#18181b;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" style="max-width:560px;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e4e4e7;">
      <tr><td style="background:#0f172a;padding:20px 32px;">
        <span style="color:#fff;font-size:18px;font-weight:700;letter-spacing:-0.5px;">${BRAND}</span>
      </td></tr>
      <tr><td style="padding:32px;">${body}</td></tr>
      <tr><td style="padding:16px 32px;border-top:1px solid #e4e4e7;font-size:12px;color:#71717a;">
        ${BRAND} &mdash; This is an automated message.
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function btn(href: string, label: string, variant: "primary" | "success" | "danger" = "primary"): string {
  const bg = variant === "success" ? "#16a34a" : variant === "danger" ? "#dc2626" : "#0f172a";
  return `<a href="${href}" style="display:inline-block;background:${bg};color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;margin:4px 4px 4px 0;">${label}</a>`;
}

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Invoice ────────────────────────────────────────────────────────────────

export interface InvoiceEmailData {
  invoiceNumber: string;
  clientName: string;
  totalCents: number;
  balanceCents: number;
  dueDateStr: string | null;
  viewUrl: string;
  notes: string | null;
}

export function invoiceEmailHtml(d: InvoiceEmailData): string {
  const dueRow = d.dueDateStr
    ? `<tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Due date:</td><td style="padding:4px 0;font-size:13px;">${d.dueDateStr}</td></tr>`
    : "";
  return wrap(`
    <h2 style="margin:0 0 8px;font-size:22px;color:#0f172a;">Invoice ${d.invoiceNumber}</h2>
    <p style="margin:0 0 24px;color:#52525b;font-size:15px;">Hi ${d.clientName}, please find your invoice details below.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Invoice #:</td><td style="padding:4px 0;font-weight:600;font-size:13px;">${d.invoiceNumber}</td></tr>
      <tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Total:</td><td style="padding:4px 0;font-weight:600;font-size:13px;">${dollars(d.totalCents)}</td></tr>
      <tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Balance due:</td><td style="padding:4px 0;font-weight:700;font-size:15px;color:#0f172a;">${dollars(d.balanceCents)}</td></tr>
      ${dueRow}
    </table>
    ${d.notes ? `<p style="margin:0 0 24px;padding:12px;background:#f4f4f5;border-radius:6px;font-size:13px;color:#52525b;">${d.notes}</p>` : ""}
    <p>${btn(d.viewUrl, "View Invoice")}</p>
    <p style="margin:16px 0 0;font-size:12px;color:#a1a1aa;">To pay or discuss this invoice, please contact us directly.</p>
  `);
}

export function invoiceEmailText(d: InvoiceEmailData): string {
  return `Invoice ${d.invoiceNumber}\n\nHi ${d.clientName},\n\nTotal: ${dollars(d.totalCents)}\nBalance due: ${dollars(d.balanceCents)}${d.dueDateStr ? `\nDue: ${d.dueDateStr}` : ""}\n${d.notes ? `\nNotes: ${d.notes}\n` : ""}\nView: ${d.viewUrl}\n\n${BRAND}`;
}

// ── Estimate ───────────────────────────────────────────────────────────────

export interface EstimateEmailData {
  estimateRef: string;
  clientName: string;
  totalCents: number;
  depositCents: number;
  balanceCents: number;
  expiresStr: string | null;
  notes: string | null;
  approveUrl: string;
  declineUrl: string;
  viewUrl: string;
}

export function estimateEmailHtml(d: EstimateEmailData): string {
  const expiresRow = d.expiresStr
    ? `<tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Expires:</td><td style="padding:4px 0;font-size:13px;">${d.expiresStr}</td></tr>`
    : "";
  return wrap(`
    <h2 style="margin:0 0 8px;font-size:22px;color:#0f172a;">Estimate ${d.estimateRef}</h2>
    <p style="margin:0 0 24px;color:#52525b;font-size:15px;">Hi ${d.clientName}, here is your estimate from ${BRAND}.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Estimate #:</td><td style="padding:4px 0;font-weight:600;font-size:13px;">${d.estimateRef}</td></tr>
      <tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Total:</td><td style="padding:4px 0;font-weight:700;font-size:15px;color:#0f172a;">${dollars(d.totalCents)}</td></tr>
      ${d.depositCents > 0 ? `<tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Deposit (30%):</td><td style="padding:4px 0;font-size:13px;">${dollars(d.depositCents)}</td></tr>` : ""}
      ${d.depositCents > 0 ? `<tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Balance on completion:</td><td style="padding:4px 0;font-size:13px;">${dollars(d.balanceCents)}</td></tr>` : ""}
      ${expiresRow}
    </table>
    ${d.notes ? `<p style="margin:0 0 24px;padding:12px;background:#f4f4f5;border-radius:6px;font-size:13px;color:#52525b;">${d.notes}</p>` : ""}
    <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#0f172a;">Please review and respond:</p>
    <p>
      ${btn(d.approveUrl, "✓ Approve Estimate", "success")}
      ${btn(d.declineUrl, "✗ Decline", "danger")}
    </p>
    <p style="margin:16px 0 0;font-size:13px;color:#71717a;">Or <a href="${d.viewUrl}" style="color:#2563eb;">view the full estimate</a> for itemized details.</p>
    <p style="margin:8px 0 0;font-size:12px;color:#a1a1aa;">These links are unique to you and expire when the estimate closes.</p>
  `);
}

export function estimateEmailText(d: EstimateEmailData): string {
  return `Estimate ${d.estimateRef}\n\nHi ${d.clientName},\n\nTotal: ${dollars(d.totalCents)}${d.depositCents > 0 ? `\nDeposit (30%): ${dollars(d.depositCents)}\nBalance: ${dollars(d.balanceCents)}` : ""}${d.expiresStr ? `\nExpires: ${d.expiresStr}` : ""}\n${d.notes ? `\nNotes: ${d.notes}\n` : ""}\nApprove: ${d.approveUrl}\nDecline: ${d.declineUrl}\n\n${BRAND}`;
}

// ── Visit reminder ─────────────────────────────────────────────────────────

export interface VisitReminderEmailData {
  clientName: string;
  jobTitle: string;
  scheduledStart: string;
  propertyAddress: string | null;
  techName: string | null;
}

export function visitReminderEmailHtml(d: VisitReminderEmailData): string {
  const when = new Date(d.scheduledStart).toLocaleString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
  return wrap(`
    <h2 style="margin:0 0 8px;font-size:22px;color:#0f172a;">Appointment Reminder</h2>
    <p style="margin:0 0 24px;color:#52525b;font-size:15px;">Hi ${d.clientName}, this is a reminder about your upcoming service visit.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Service:</td><td style="padding:4px 0;font-size:13px;font-weight:600;">${d.jobTitle}</td></tr>
      <tr><td style="padding:4px 0;color:#71717a;font-size:13px;">When:</td><td style="padding:4px 0;font-size:13px;">${when}</td></tr>
      ${d.propertyAddress ? `<tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Where:</td><td style="padding:4px 0;font-size:13px;">${d.propertyAddress}</td></tr>` : ""}
      ${d.techName ? `<tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Technician:</td><td style="padding:4px 0;font-size:13px;">${d.techName}</td></tr>` : ""}
    </table>
    <p style="margin:0;font-size:14px;color:#52525b;">Questions? Please contact us and we'll be happy to help.</p>
  `);
}

// ── Invoice follow-up ──────────────────────────────────────────────────────

export interface InvoiceFollowupEmailData {
  clientName: string;
  invoiceNumber: string;
  totalCents: number;
  balanceCents: number;
  daysOverdue: number;
  viewUrl: string;
}

export function invoiceFollowupEmailHtml(d: InvoiceFollowupEmailData): string {
  return wrap(`
    <h2 style="margin:0 0 8px;font-size:22px;color:#dc2626;">Payment Reminder</h2>
    <p style="margin:0 0 24px;color:#52525b;font-size:15px;">Hi ${d.clientName}, your invoice is now ${d.daysOverdue} day${d.daysOverdue !== 1 ? "s" : ""} overdue. Please arrange payment at your earliest convenience.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Invoice #:</td><td style="padding:4px 0;font-size:13px;font-weight:600;">${d.invoiceNumber}</td></tr>
      <tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Total:</td><td style="padding:4px 0;font-size:13px;">${dollars(d.totalCents)}</td></tr>
      <tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Balance due:</td><td style="padding:4px 0;font-weight:700;font-size:15px;color:#dc2626;">${dollars(d.balanceCents)}</td></tr>
    </table>
    <p>${btn(d.viewUrl, "View Invoice")}</p>
    <p style="margin:16px 0 0;font-size:12px;color:#a1a1aa;">Please contact us if you have any questions about this invoice.</p>
  `);
}

// ── On My Way ──────────────────────────────────────────────────────────────

export interface OnMyWayEmailData {
  clientName: string;
  jobTitle: string;
  when: string;
  propertyAddress: string | null;
  techName: string | null;
}

export function onMyWayEmailHtml(d: OnMyWayEmailData): string {
  return wrap(`
    <h2 style="margin:0 0 8px;font-size:22px;color:#0f172a;">On My Way!</h2>
    <p style="margin:0 0 24px;color:#52525b;font-size:15px;">Hi ${d.clientName}, your technician is on their way to your service appointment.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Service:</td><td style="padding:4px 0;font-size:13px;font-weight:600;">${d.jobTitle}</td></tr>
      <tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Scheduled:</td><td style="padding:4px 0;font-size:13px;">${d.when}</td></tr>
      ${d.propertyAddress ? `<tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Location:</td><td style="padding:4px 0;font-size:13px;">${d.propertyAddress}</td></tr>` : ""}
      ${d.techName ? `<tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Technician:</td><td style="padding:4px 0;font-size:13px;">${d.techName}</td></tr>` : ""}
    </table>
    <p style="margin:0;font-size:14px;color:#52525b;">Please ensure someone is available to provide access. Questions? Contact us and we'll be happy to help.</p>
  `);
}

// ── Booking Confirmed ──────────────────────────────────────────────────────

export interface BookingConfirmedEmailData {
  clientName: string;
  jobTitle: string;
  scheduledStart: string;
  scheduledEnd: string;
  propertyAddress: string | null;
  techName: string | null;
}

export function bookingConfirmedEmailHtml(d: BookingConfirmedEmailData): string {
  const start = new Date(d.scheduledStart).toLocaleString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
  const end = new Date(d.scheduledEnd).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit",
  });
  return wrap(`
    <h2 style="margin:0 0 8px;font-size:22px;color:#16a34a;">Booking Confirmed</h2>
    <p style="margin:0 0 24px;color:#52525b;font-size:15px;">Hi ${d.clientName}, your appointment with ${BRAND} is confirmed. We look forward to seeing you!</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Service:</td><td style="padding:4px 0;font-size:13px;font-weight:600;">${d.jobTitle}</td></tr>
      <tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Date &amp; Time:</td><td style="padding:4px 0;font-size:13px;">${start} – ${end}</td></tr>
      ${d.propertyAddress ? `<tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Location:</td><td style="padding:4px 0;font-size:13px;">${d.propertyAddress}</td></tr>` : ""}
      ${d.techName ? `<tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Technician:</td><td style="padding:4px 0;font-size:13px;">${d.techName}</td></tr>` : ""}
    </table>
    <p style="margin:0;font-size:14px;color:#52525b;">Need to reschedule or have questions? Just reply to this email or give us a call — we're happy to help.</p>
  `);
}

// ── Review Request ─────────────────────────────────────────────────────────

export interface ReviewRequestEmailData {
  clientName: string;
  jobTitle: string;
  techName: string | null;
}

export function reviewRequestEmailHtml(d: ReviewRequestEmailData): string {
  return wrap(`
    <h2 style="margin:0 0 8px;font-size:22px;color:#0f172a;">How Did We Do?</h2>
    <p style="margin:0 0 24px;color:#52525b;font-size:15px;">Hi ${d.clientName}, thank you for choosing ${BRAND}${d.techName ? ` and working with ${d.techName}` : ""}. We hope everything went smoothly with your ${d.jobTitle} service.</p>
    <p style="margin:0 0 16px;font-size:15px;color:#18181b;">Your feedback means the world to a small, local business like ours. If you had a great experience, we'd really appreciate a quick review — it helps other homeowners find us.</p>
    <p style="margin:0 0 24px;font-size:14px;color:#52525b;">And if anything wasn't perfect, please reach out directly — we want to make it right.</p>
    <p style="margin:0;font-size:13px;color:#71717a;">Thank you again for your business — we appreciate you!</p>
  `);
}
