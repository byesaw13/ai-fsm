import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { withRole } from "@/lib/auth/middleware";
import { withEstimateContext } from "@/lib/estimates/db";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@/lib/logger";
import { sendEmail, appUrl, isEmailConfigured } from "@/lib/email/mailer";
import { estimateEmailHtml, estimateEmailText } from "@ai-fsm/email-templates";
import { getEnv } from "@/lib/env";
import { reviewEstimateGuardrails } from "@/lib/estimates/guardrails";
import { logCommunication } from "@/lib/communications-log";
import { loadEstimatePdf } from "@/lib/pdf/load";

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
                e.expires_at, e.notes, e.sent_at, e.share_token,
                e.trip_count, e.requires_drying_or_curing, e.difficult_access,
                e.old_house_risk, e.coordination_required, e.finish_expectation,
                e.travel_surcharge_cents, e.risk_adjustment_cents,
                e.minimum_service_override_reason,
                c.id AS client_id, c.name AS client_name, c.email AS client_email,
                (SELECT COUNT(*)::int FROM estimate_line_items eli
                 WHERE eli.estimate_id = e.id AND eli.visible_to_customer = true) AS line_item_count
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
        share_token: string;
        trip_count: "one_trip" | "multi_trip";
        requires_drying_or_curing: boolean;
        difficult_access: boolean;
        old_house_risk: boolean;
        coordination_required: boolean;
        finish_expectation: "basic" | "clean" | "premium";
        travel_surcharge_cents: number;
        risk_adjustment_cents: number;
        minimum_service_override_reason: "bundled" | "membership_included" | "promo" | "owner_approved" | null;
        client_id: string; client_name: string; client_email: string | null;
        line_item_count: number;
      };

      if (["approved", "declined", "expired"].includes(est.status)) {
        return { status: 422, message: `Cannot send a ${est.status} estimate` };
      }

      if (!est.client_email) {
        return { status: 422, message: "Client has no email address on file" };
      }

      const pricingReview = reviewEstimateGuardrails({
        ...est,
        margin_pct: null,
        has_ma_regulated_items: false,
        line_item_count: est.line_item_count,
      });
      await client.query(
        `UPDATE estimates
         SET pricing_review_status = $1,
             pricing_reviewed_at = now(),
             pricing_reviewed_by = $2,
             updated_at = now()
         WHERE id = $3`,
        [pricingReview.status, session.userId, id]
      );

      if (pricingReview.blockers.length > 0) {
        return {
          status: 409,
          code: "PRICING_REVIEW_BLOCKED",
          message: pricingReview.blockers.map((b) => b.message).join(" "),
          details: pricingReview,
        };
      }


      // No-email path: flip status to sent without delivery so the workflow
      // can progress on servers where SMTP is not configured (dev / CI).
      if (process.env.E2E_SKIP_EMAIL_DELIVERY === "1" || !isEmailConfigured()) {
        if (est.status === "draft") {
          await client.query(
            `UPDATE estimates SET status = 'sent', sent_at = now(), updated_at = now() WHERE id = $1`,
            [id],
          );
        }
        await appendAuditLog(client, {
          account_id: session.accountId,
          entity_type: "estimate",
          entity_id: id,
          action: "update",
          actor_id: session.userId,
          trace_id: session.traceId,
          old_value: { status: est.status },
          new_value: { status: "sent", email_skipped: true },
        });
        return { status: 200, sentTo: null, emailSkipped: true };
      }

      const secret = new TextEncoder().encode(getEnv().AUTH_SECRET);
      const [approveToken, declineToken] = await Promise.all([
        signToken({ estimateId: id, action: "approve" }, secret),
        signToken({ estimateId: id, action: "decline" }, secret),
      ]);

      const base = appUrl();
      // Links go to the confirmation page (GET read-only), not the API.
      // The confirmation page renders a POST form to do the actual mutation.
      const approveUrl = `${base}/estimate/respond?action=approve&token=${encodeURIComponent(approveToken)}`;
      const declineUrl = `${base}/estimate/respond?action=decline&token=${encodeURIComponent(declineToken)}`;
      const viewUrl = `${base}/portal/estimates/${est.share_token}`;
      const estimateRef = id.slice(0, 8).toUpperCase();

      // Attach the estimate as a PDF (best-effort — never block the email).
      let pdf: Awaited<ReturnType<typeof loadEstimatePdf>> = null;
      try {
        pdf = await loadEstimatePdf(client, session.accountId, id);
      } catch (err) {
        logger.warn("[estimates/send] PDF render failed; sending without attachment", {
          estimateId: id,
          error: (err as Error).message,
        });
      }

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
        attachments: pdf
          ? [{ filename: pdf.filename, content: pdf.bytes, contentType: "application/pdf" }]
          : undefined,
      });

      if (!emailResult.ok) {
        await logCommunication({
          accountId: session.accountId,
          channel: "email",
          direction: "outbound",
          outcome: "failed",
          clientId: est.client_id,
          bodyPreview: `Estimate ${estimateRef} from Dovetails Services LLC`,
          initiatedBy: session.userId,
          externalId: emailResult.error ?? null,
        });
        return { status: 502, message: `Email send failed: ${emailResult.error}` };
      }

      await logCommunication({
        accountId: session.accountId,
        channel: "email",
        direction: "outbound",
        outcome: "sent",
        clientId: est.client_id,
        bodyPreview: `Estimate ${estimateRef} from Dovetails Services LLC`,
        initiatedBy: session.userId,
      });

      // Only the draft→sent transition writes sent_at. The estimate
      // immutability invariant (migration 004) forbids changing sent_at once
      // the estimate is in sent state, so a re-send must not touch it — the
      // send is recorded via the communications + audit log.
      if (est.status === "draft") {
        await client.query(
          `UPDATE estimates SET status = 'sent', sent_at = now(), updated_at = now() WHERE id = $1`,
          [id],
        );
      }

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
      return NextResponse.json(
        {
          error: {
            code: result.code ?? "SEND_ERROR",
            message: result.message,
            details: result.details,
          },
        },
        { status: result.status }
      );
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
