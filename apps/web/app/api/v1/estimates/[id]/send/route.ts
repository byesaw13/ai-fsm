import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { withRole } from "@/lib/auth/middleware";
import { withEstimateContext } from "@/lib/estimates/db";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@/lib/logger";
import { sendEmail, appUrl, isEmailConfigured } from "@/lib/email/mailer";
import { estimateEmailHtml, estimateEmailText } from "@/lib/email/templates";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

async function signToken(payload: Record<string, string>, secret: Uint8Array): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
}

export const POST = withRole(["owner", "admin"], async (request, session) => {
  const id = request.nextUrl.pathname.split("/").at(-2)!;

  try {
    const result = await withEstimateContext(session, async (client) => {
      const { rows, rowCount } = await client.query(
        `SELECT e.id, e.status, e.total_cents, e.deposit_cents, e.balance_cents,
                e.expires_at, e.notes, e.sent_at,
                c.name AS client_name, c.email AS client_email
         FROM estimates e
         JOIN clients c ON c.id = e.client_id
         WHERE e.id = $1 AND e.account_id = $2`,
        [id, session.accountId]
      );

      if (!rowCount || rowCount === 0) return { status: 404 };

      const est = rows[0] as {
        id: string; status: string; total_cents: number;
        deposit_cents: number; balance_cents: number;
        expires_at: string | null; notes: string | null; sent_at: string | null;
        client_name: string; client_email: string | null;
      };

      if (["approved", "declined", "expired"].includes(est.status)) {
        return { status: 422, message: `Cannot send a ${est.status} estimate` };
      }

      if (!est.client_email) {
        return { status: 422, message: "Client has no email address on file" };
      }

      if (!isEmailConfigured()) {
        return { status: 503, message: "Email is not configured on this server" };
      }

      const secret = new TextEncoder().encode(getEnv().AUTH_SECRET);
      const [approveToken, declineToken] = await Promise.all([
        signToken({ estimateId: id, action: "approve" }, secret),
        signToken({ estimateId: id, action: "decline" }, secret),
      ]);

      const base = appUrl();
      const approveUrl = `${base}/api/v1/estimates/${id}/respond?action=approve&token=${encodeURIComponent(approveToken)}`;
      const declineUrl = `${base}/api/v1/estimates/${id}/respond?action=decline&token=${encodeURIComponent(declineToken)}`;
      const viewUrl = `${base}/app/estimates/${id}`;
      const estimateRef = id.slice(0, 8).toUpperCase();

      const expiresStr = est.expires_at
        ? new Date(est.expires_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
        : null;

      const emailResult = await sendEmail({
        to: est.client_email,
        subject: `Estimate ${estimateRef} from Dovetails Services LLC`,
        html: estimateEmailHtml({
          estimateRef,
          clientName: est.client_name,
          totalCents: est.total_cents,
          depositCents: est.deposit_cents,
          balanceCents: est.balance_cents,
          expiresStr,
          notes: est.notes,
          approveUrl,
          declineUrl,
          viewUrl,
        }),
        text: estimateEmailText({
          estimateRef,
          clientName: est.client_name,
          totalCents: est.total_cents,
          depositCents: est.deposit_cents,
          balanceCents: est.balance_cents,
          expiresStr,
          notes: est.notes,
          approveUrl,
          declineUrl,
          viewUrl,
        }),
      });

      if (!emailResult.ok) {
        return { status: 502, message: `Email send failed: ${emailResult.error}` };
      }

      const setClauses = est.status === "draft"
        ? "status = 'sent', sent_at = now(), updated_at = now()"
        : "sent_at = now(), updated_at = now()";

      await client.query(`UPDATE estimates SET ${setClauses} WHERE id = $1`, [id]);

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "estimate",
        entity_id: id,
        action: "update",
        actor_id: session.userId,
        trace_id: session.traceId,
        old_value: { status: est.status, sent_at: est.sent_at },
        new_value: { sent_to: est.client_email, status: est.status === "draft" ? "sent" : est.status },
      });

      return { status: 200, sentTo: est.client_email };
    });

    if (result.status === 404) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Estimate not found" } }, { status: 404 });
    }
    if (result.status !== 200) {
      return NextResponse.json({ error: { code: "SEND_ERROR", message: result.message } }, { status: result.status });
    }

    return NextResponse.json({ sent: true, sentTo: result.sentTo });
  } catch (error) {
    logger.error("POST /api/v1/estimates/[id]/send error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to send estimate", traceId: session.traceId } },
      { status: 500 }
    );
  }
});
