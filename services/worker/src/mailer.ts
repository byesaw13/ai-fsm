import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

let _transporter: Transporter | null = null;

export function isEmailConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter(): Transporter {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST!,
      port: parseInt(process.env.SMTP_PORT ?? "587"),
      secure: process.env.SMTP_PORT === "465",
      auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
    });
  }
  return _transporter;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!isEmailConfigured()) {
    return { ok: false, error: "Email not configured" };
  }
  try {
    const from = process.env.SMTP_FROM ?? process.env.SMTP_USER!;
    await getTransporter().sendMail({ from, ...opts });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

const BRAND = "Dovetails Services LLC";

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function wrap(body: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,sans-serif;color:#18181b;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
<tr><td align="center"><table width="100%" style="max-width:560px;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e4e4e7;">
<tr><td style="background:#0f172a;padding:20px 32px;"><span style="color:#fff;font-size:18px;font-weight:700;">${BRAND}</span></td></tr>
<tr><td style="padding:32px;">${body}</td></tr>
<tr><td style="padding:16px 32px;border-top:1px solid #e4e4e7;font-size:12px;color:#71717a;">${BRAND} &mdash; This is an automated message.</td></tr>
</table></td></tr></table></body></html>`;
}

export function visitReminderHtml(d: {
  clientName: string; jobTitle: string; when: string;
  propertyAddress: string | null; techName: string | null;
}): string {
  return wrap(`
    <h2 style="margin:0 0 8px;font-size:22px;color:#0f172a;">Appointment Reminder</h2>
    <p style="margin:0 0 24px;color:#52525b;font-size:15px;">Hi ${d.clientName}, this is a reminder about your upcoming service visit.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Service:</td><td style="padding:4px 0;font-size:13px;font-weight:600;">${d.jobTitle}</td></tr>
      <tr><td style="padding:4px 0;color:#71717a;font-size:13px;">When:</td><td style="padding:4px 0;font-size:13px;">${d.when}</td></tr>
      ${d.propertyAddress ? `<tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Where:</td><td style="padding:4px 0;font-size:13px;">${d.propertyAddress}</td></tr>` : ""}
      ${d.techName ? `<tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Technician:</td><td style="padding:4px 0;font-size:13px;">${d.techName}</td></tr>` : ""}
    </table>
    <p style="margin:0;font-size:14px;color:#52525b;">Questions? Please contact us and we'll be happy to help.</p>
  `);
}

export function invoiceFollowupHtml(d: {
  clientName: string; invoiceNumber: string;
  totalCents: number; balanceCents: number; daysOverdue: number; viewUrl: string;
}): string {
  return wrap(`
    <h2 style="margin:0 0 8px;font-size:22px;color:#dc2626;">Payment Reminder</h2>
    <p style="margin:0 0 24px;color:#52525b;font-size:15px;">Hi ${d.clientName}, your invoice is now ${d.daysOverdue} day${d.daysOverdue !== 1 ? "s" : ""} overdue. Please arrange payment at your earliest convenience.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Invoice #:</td><td style="padding:4px 0;font-size:13px;font-weight:600;">${d.invoiceNumber}</td></tr>
      <tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Total:</td><td style="padding:4px 0;font-size:13px;">${dollars(d.totalCents)}</td></tr>
      <tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Balance due:</td><td style="padding:4px 0;font-weight:700;font-size:15px;color:#dc2626;">${dollars(d.balanceCents)}</td></tr>
    </table>
    <p><a href="${d.viewUrl}" style="display:inline-block;background:#0f172a;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">View Invoice</a></p>
    <p style="margin:16px 0 0;font-size:12px;color:#a1a1aa;">Please contact us if you have any questions about this invoice.</p>
  `);
}
