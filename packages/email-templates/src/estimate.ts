import { formatCents } from "@ai-fsm/money";
import { BRAND, btn, wrap } from "./layout.js";
import type { EstimateEmailData, EstimateFollowupEmailData } from "./types.js";

export function estimateEmailHtml(d: EstimateEmailData): string {
  const expiresRow = d.expiresStr
    ? `<tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Expires:</td><td style="padding:4px 0;font-size:13px;">${d.expiresStr}</td></tr>`
    : "";
  return wrap(`
    <h2 style="margin:0 0 8px;font-size:22px;color:#0f172a;">Estimate ${d.estimateRef}</h2>
    <p style="margin:0 0 24px;color:#52525b;font-size:15px;">Hi ${d.clientName}, here is your estimate from ${BRAND}.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Estimate #:</td><td style="padding:4px 0;font-weight:600;font-size:13px;">${d.estimateRef}</td></tr>
      <tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Total:</td><td style="padding:4px 0;font-weight:700;font-size:15px;color:#0f172a;">${formatCents(d.totalCents)}</td></tr>
      ${d.depositCents > 0 ? `<tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Deposit due:</td><td style="padding:4px 0;font-size:13px;">${formatCents(d.depositCents)}</td></tr>` : ""}
      ${d.depositCents > 0 ? `<tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Balance due:</td><td style="padding:4px 0;font-size:13px;">${formatCents(d.balanceCents)}</td></tr>` : ""}
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
  return `Estimate ${d.estimateRef}\n\nHi ${d.clientName},\n\nTotal: ${formatCents(d.totalCents)}${d.depositCents > 0 ? `\nDeposit due: ${formatCents(d.depositCents)}\nBalance: ${formatCents(d.balanceCents)}` : ""}${d.expiresStr ? `\nExpires: ${d.expiresStr}` : ""}\n${d.notes ? `\nNotes: ${d.notes}\n` : ""}\nApprove: ${d.approveUrl}\nDecline: ${d.declineUrl}\n\n${BRAND}`;
}

export function estimateFollowupHtml(d: EstimateFollowupEmailData): string {
  return wrap(`
    <h2 style="margin:0 0 8px;font-size:22px;color:#0f172a;">Just Checking In</h2>
    <p style="margin:0 0 24px;color:#52525b;font-size:15px;">Hi ${d.clientName}, we sent over your estimate ${d.daysSinceSent} day${d.daysSinceSent !== 1 ? "s" : ""} ago and wanted to make sure it reached you.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Estimate #:</td><td style="padding:4px 0;font-size:13px;font-weight:600;">${d.estimateNumber}</td></tr>
      <tr><td style="padding:4px 0;color:#71717a;font-size:13px;">Total:</td><td style="padding:4px 0;font-size:13px;">${formatCents(d.totalCents)}</td></tr>
    </table>
    <p style="margin:0 0 24px;font-size:15px;color:#18181b;"><a href="${d.viewUrl}" style="color:#0f172a;font-weight:600;">View your estimate &rarr;</a></p>
    <p style="margin:0;font-size:13px;color:#71717a;">No rush — just let us know if you have questions or want to schedule.</p>
  `);
}