import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPool, query, queryOne } from "@/lib/db";
import { appUrl, sendEmail } from "@/lib/email/mailer";
import { normalizePhone } from "@/lib/phone";
import { emitAttentionEvent } from "@/lib/attention";
import { requirePortalClient } from "@/lib/portal/guard";
import { checkRateLimit, getClientIp, SENSITIVE_RATE_LIMIT } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { BUSINESS_PHONE_DISPLAY } from "@/lib/sms/consent";

export const dynamic = "force-dynamic";

const schema = z
  .object({
    phone: z.string().max(30).optional(),
    email: z.string().email().max(255).optional(),
    preferred_contact: z.enum(["sms", "email", "phone"]).optional(),
  })
  .strict();

const CONTACT_LABEL: Record<string, string> = { sms: "text", email: "email", phone: "phone call" };

/**
 * PATCH /api/portal/[clientToken]/profile — TASK-161 "Your info".
 * Phone and preferred contact apply now. A new email is the login identity, so
 * it only lands after the new address clicks a verify link; the old address is
 * told. Name and address changes go through the office.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ clientToken: string }> },
) {
  const { clientToken } = await params;
  const guard = await requirePortalClient(clientToken, { write: true });
  if ("response" in guard) return guard.response;
  const { client } = guard;

  const rl = checkRateLimit(`portal-profile:${getClientIp(request)}`, SENSITIVE_RATE_LIMIT);
  if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid details" }, { status: 400 });
  }
  const data = parsed.data;

  let phone: string | undefined;
  if (data.phone !== undefined) {
    const normalized = normalizePhone(data.phone);
    if (!normalized) {
      return NextResponse.json({ error: "Enter a 10-digit phone number" }, { status: 400 });
    }
    phone = normalized;
  }

  const changes: string[] = [];
  if (phone && phone !== client.phone) changes.push(`phone ${client.phone ?? "(none)"} → ${phone}`);
  if (data.preferred_contact && data.preferred_contact !== client.preferred_contact) {
    changes.push(`prefers ${CONTACT_LABEL[data.preferred_contact]}`);
  }

  let emailPending = false;
  const newEmail = data.email?.trim().toLowerCase();
  if (newEmail && newEmail !== client.email?.toLowerCase()) {
    const taken = await queryOne(
      `SELECT 1 FROM clients WHERE account_id = $1 AND id <> $2 AND lower(email) = $3`,
      [client.account_id, client.id, newEmail],
    );
    if (taken) {
      return NextResponse.json(
        { error: "We can't switch to that email online. Please call or text us." },
        { status: 409 },
      );
    }
    const [link] = await query<{ token: string }>(
      `INSERT INTO portal_magic_links (client_id, expires_at, pending_email)
       VALUES ($1, now() + interval '1 hour', $2) RETURNING token::text`,
      [client.id, newEmail],
    );
    const verifyUrl = `${appUrl()}/api/v1/portal/auth/verify-email?token=${link.token}`;
    const sent = await sendEmail({
      to: newEmail,
      subject: "Confirm your new email for Dovetails",
      text: `Hi ${client.name},\n\nConfirm this is your new email for your Dovetails account:\n${verifyUrl}\n\nThe link expires in 1 hour. If you didn't ask for this, ignore this email.`,
      html: `<p>Hi ${escapeHtml(client.name)},</p><p>Confirm this is your new email for your Dovetails account:</p><p><a href="${verifyUrl}">Confirm my email</a></p><p style="color:#6b7280;font-size:12px">The link expires in 1 hour. If you didn't ask for this, ignore this email.</p>`,
    });
    if (!sent.ok) {
      logger.warn("portal email-change verify send failed", { error: sent.error });
      return NextResponse.json({ error: "We couldn't send the confirmation email. Try again later." }, { status: 502 });
    }
    if (client.email) {
      await sendEmail({
        to: client.email,
        subject: "Your Dovetails email is being changed",
        text: `Hi ${client.name},\n\nSomeone signed in to your Dovetails portal asked to change your email to ${newEmail}. If this wasn't you, call or text us at ${BUSINESS_PHONE_DISPLAY}.`,
        html: `<p>Hi ${escapeHtml(client.name)},</p><p>Someone signed in to your Dovetails portal asked to change your email to <strong>${escapeHtml(newEmail)}</strong>. If this wasn't you, call or text us at ${BUSINESS_PHONE_DISPLAY}.</p>`,
      });
    }
    emailPending = true;
    changes.push(`asked to change email to ${newEmail} (pending confirmation)`);
  }

  if (changes.length === 0) return NextResponse.json({ ok: true, emailPending });

  const db = await getPool().connect();
  try {
    await db.query("BEGIN");
    await db.query(
      `SELECT set_config('app.current_account_id', $1, true), set_config('app.current_role', 'owner', true)`,
      [client.account_id],
    );
    await db.query(
      `UPDATE clients
       SET phone = COALESCE($2, phone),
           preferred_contact = COALESCE($3, preferred_contact),
           updated_at = now()
       WHERE id = $1`,
      [client.id, phone ?? null, data.preferred_contact ?? null],
    );
    await emitAttentionEvent(db, {
      accountId: client.account_id,
      type: "client.profile_updated",
      entityType: "client",
      entityId: client.id,
      title: `${client.name} updated their info`,
      summary: changes.join("; "),
      href: `/app/clients/${client.id}`,
    });
    await db.query("COMMIT");
  } catch (err) {
    await db.query("ROLLBACK");
    logger.error("PATCH portal profile failed", err);
    return NextResponse.json({ error: "Could not save your changes" }, { status: 500 });
  } finally {
    db.release();
  }

  return NextResponse.json({ ok: true, emailPending });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
