import { BRAND, wrap } from "./layout.js";
import type { ReviewRequestEmailData } from "./types.js";

export function reviewRequestEmailHtml(d: ReviewRequestEmailData): string {
  return wrap(`
    <h2 style="margin:0 0 8px;font-size:22px;color:#0f172a;">How Did We Do?</h2>
    <p style="margin:0 0 24px;color:#52525b;font-size:15px;">Hi ${d.clientName}, thank you for choosing ${BRAND}${d.techName ? ` and working with ${d.techName}` : ""}. We hope everything went smoothly with your ${d.jobTitle} service.</p>
    <p style="margin:0 0 16px;font-size:15px;color:#18181b;">Your feedback means the world to a small, local business like ours. If you had a great experience, we'd really appreciate a quick review — it helps other homeowners find us.</p>
    <p style="margin:0 0 24px;font-size:14px;color:#52525b;">And if anything wasn't perfect, please reach out directly — we want to make it right.</p>
    <p style="margin:0;font-size:13px;color:#71717a;">Thank you again for your business — we appreciate you!</p>
  `);
}