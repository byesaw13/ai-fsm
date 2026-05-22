import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { query } from "@/lib/db";
import { sendEmail, appUrl } from "@/lib/email/mailer";

const schema = z.object({ email: z.string().email() });

export async function POST(request: NextRequest) {
  const traceId = randomUUID();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "Invalid request body", traceId } },
      { status: 400 }
    );
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "A valid email address is required", traceId } },
      { status: 400 }
    );
  }

  const { email } = parsed.data;

  // Look up client by email. Single-account deployment in practice; no info leak on miss.
  const clients = await query<{ id: string; name: string; portal_token: string }>(
    `SELECT id, name, portal_token::text FROM clients WHERE lower(email) = lower($1) LIMIT 1`,
    [email]
  );

  if (clients.length > 0) {
    const client = clients[0];

    const links = await query<{ token: string }>(
      `INSERT INTO portal_magic_links (client_id, expires_at)
       VALUES ($1, now() + interval '1 hour')
       RETURNING token::text`,
      [client.id]
    );
    const magicToken = links[0].token;
    const verifyUrl = `${appUrl()}/api/v1/portal/auth/verify?token=${magicToken}`;

    await sendEmail({
      to: email,
      subject: "Your Dovetails portal link",
      html: magicLinkHtml(client.name, verifyUrl),
      text: [
        `Hi ${client.name},`,
        "",
        "Click the link below to access your Dovetails account portal.",
        "This link expires in 1 hour and can only be used once.",
        "",
        verifyUrl,
        "",
        "If you didn't request this, you can safely ignore this email.",
      ].join("\n"),
    });
  }

  // Always respond OK — don't reveal whether the email is registered
  return NextResponse.json({ ok: true });
}

function magicLinkHtml(name: string, url: string): string {
  const firstName = name.split(" ")[0];
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:48px auto;background:#fff;border-radius:10px;border:1px solid #e5e7eb;padding:40px;">
    <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#111;">Your portal link</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:15px;">Hi ${firstName}, click below to access your account.</p>
    <a href="${url}"
       style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:13px 28px;border-radius:7px;font-size:15px;font-weight:600;letter-spacing:.01em;">
      Open my portal
    </a>
    <p style="margin:28px 0 0;font-size:12px;color:#9ca3af;line-height:1.5;">
      This link expires in 1 hour and can only be used once.<br>
      If you didn't request this, no action is needed.
    </p>
  </div>
</body>
</html>`;
}
