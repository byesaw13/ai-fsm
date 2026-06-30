import { BRAND, btn, wrap } from "./layout.js";
import type { IntakeInviteEmailData } from "./types.js";

export function intakeInviteEmailHtml(d: IntakeInviteEmailData): string {
  const expires = d.expiresHours ?? 48;
  return wrap(`
    <h2 style="margin:0 0 8px;font-size:22px;color:#0f172a;">Tell us about your project</h2>
    <p style="margin:0 0 16px;color:#52525b;font-size:15px;">Hi ${d.leadName},</p>
    <p style="margin:0 0 16px;color:#52525b;font-size:15px;">Thanks for reaching out to ${BRAND}! To get you an accurate estimate, we'd love to hear a bit more about your project.</p>
    <p style="margin:0 0 24px;color:#52525b;font-size:15px;">It only takes a couple of minutes — just click below and fill out a short form at your convenience.</p>
    <p style="margin:0 0 24px;">${btn(d.intakeUrl, "Fill out intake form", "primary")}</p>
    <p style="margin:0 0 8px;font-size:13px;color:#71717a;">This link expires in ${expires} hours. If it's expired, just reply to this email and we'll send a new one.</p>
    <p style="margin:0;font-size:13px;color:#71717a;">Not expecting this email? Feel free to ignore it — no action is required.</p>
  `);
}

export function intakeInviteEmailText(d: IntakeInviteEmailData): string {
  return `Hi ${d.leadName},

Thanks for reaching out to ${BRAND}! To get you an accurate estimate, we'd love to hear a bit more about your project.

Fill out our short intake form here: ${d.intakeUrl}

This link expires in ${d.expiresHours ?? 48} hours.

Not expecting this email? Feel free to ignore it.`;
}