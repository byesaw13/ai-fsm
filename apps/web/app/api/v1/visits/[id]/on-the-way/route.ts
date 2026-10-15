import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db";
import { logger } from "@/lib/logger";
import { isSmsGatewayConfigured, sendSmsViaGateway } from "@/lib/sms/gateway";
import { onTheWayText, serviceSmsPhone } from "@/lib/sms/messages";
import { logOutboundSms } from "@/lib/sms/outbound";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/visits/:id/on-the-way
 * Fired when the tech taps Navigate. One text per visit. A miss does not block the map.
 */
export const POST = withAuth(async (request: NextRequest, session: AuthSession) => {
  const id = request.nextUrl.pathname.match(/\/visits\/([^/]+)\/on-the-way/)?.[1];
  if (!id) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Visit not found", traceId: session.traceId } },
      { status: 404 }
    );
  }

  try {
    const visit = await queryOne<{
      id: string;
      job_id: string | null;
      job_title: string | null;
      property_address: string | null;
      client_id: string;
      phone: string | null;
      sms_consent: boolean;
      preferred_contact: string | null;
      tech_name: string | null;
      on_the_way_sent_at: string | null;
    }>(
      `SELECT v.id, v.job_id, v.on_the_way_sent_at::text,
              j.title AS job_title, p.address AS property_address,
              c.id AS client_id, c.phone, c.sms_consent, c.preferred_contact,
              u.full_name AS tech_name
       FROM visits v
       JOIN jobs j ON j.id = v.job_id
       JOIN clients c ON c.id = j.client_id
       LEFT JOIN properties p ON p.id = j.property_id
       LEFT JOIN users u ON u.id = v.assigned_user_id
       WHERE v.id = $1 AND v.account_id = $2`,
      [id, session.accountId]
    );
    if (!visit) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Visit not found", traceId: session.traceId } },
        { status: 404 }
      );
    }
    if (visit.on_the_way_sent_at) {
      return NextResponse.json({ sent: false, already: true });
    }

    const phone = serviceSmsPhone(visit);
    if (!phone || !isSmsGatewayConfigured()) {
      return NextResponse.json({ sent: false });
    }

    const claimed = await query<{ id: string }>(
      `UPDATE visits SET on_the_way_sent_at = now(), updated_at = now()
       WHERE id = $1 AND account_id = $2 AND on_the_way_sent_at IS NULL
       RETURNING id`,
      [id, session.accountId]
    );
    if (!claimed[0]) return NextResponse.json({ sent: false, already: true });

    const message = onTheWayText({
      techName: visit.tech_name,
      title: visit.job_title?.trim() || "your appointment",
      address: visit.property_address,
    });
    const sms = await sendSmsViaGateway({ phone, message });
    await logOutboundSms({
      accountId: session.accountId,
      clientId: visit.client_id,
      jobId: visit.job_id,
      bodyPreview: message,
      outcome: sms.ok ? "sent" : "failed",
      externalId: sms.ok ? sms.messageId : null,
      initiatedBy: session.userId,
    });
    if (!sms.ok) {
      await query(
        `UPDATE visits SET on_the_way_sent_at = NULL, updated_at = now() WHERE id = $1 AND account_id = $2`,
        [id, session.accountId]
      );
      logger.warn("on-the-way text failed", { visitId: id, error: sms.error, traceId: session.traceId });
      return NextResponse.json({ sent: false });
    }
    return NextResponse.json({ sent: true });
  } catch (err) {
    logger.error("POST on-the-way failed", err, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Could not send the text", traceId: session.traceId } },
      { status: 500 }
    );
  }
});
