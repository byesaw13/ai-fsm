export const BRAND = "Dovetails Services LLC";

export function wrap(body: string): string {
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

export function btn(href: string, label: string, variant: "primary" | "success" | "danger" = "primary"): string {
  const bg = variant === "success" ? "#16a34a" : variant === "danger" ? "#dc2626" : "#0f172a";
  return `<a href="${href}" style="display:inline-block;background:${bg};color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;margin:4px 4px 4px 0;">${label}</a>`;
}