import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "../../../../../../lib/auth/middleware";
import type { AuthSession } from "../../../../../../lib/auth/middleware";
import { getPool } from "../../../../../../lib/db";
import { appendAuditLog } from "../../../../../../lib/db/audit";
import { logger } from "../../../../../../lib/logger";
import { sendEmail, isEmailConfigured } from "../../../../../../lib/email/mailer";
import { onMyWayEmailHtml } from "../../../../../../lib/email/templates";
import { logCommunication } from "../../../../../../lib/communications-log";

export const dynamic = "force-dynamic";

export const POST = withAuth(
  async (request: NextRequest, session: AuthSession) => {
    const id = request.url.match(/\/visits\/([^/]+)\/on-my-way/)?.[1];

    if (!id) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Visit not found", traceId: session.traceId } },
        { status: 404 }
      );
    }

    const pool = getPool();
    const client = await pool.connect();

    try {
      const { rows } = await client.query(
        `SELECT v.id, v.account_id, v.status, v.scheduled_start, v.scheduled_end,
                j.id AS job_id, j.title AS job_title,
                c.id AS client_id,
                c.name AS client_name, c.email AS client_email,
                p.address AS property_address,
                u.full_name AS tech_name
         FROM visits v
         JOIN jobs j ON j.id = v.job_id
         JOIN clients c ON c.id = j.client_id
         LEFT JOIN properties p ON p.id = j.property_id
         LEFT JOIN users u ON u.id = $2
         WHERE v.id = $1 AND v.account_id = $3`,
        [id, session.userId, session.accountId]
      );

      const visit = rows[0];

      if (!visit) {
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Visit not found", traceId: session.traceId } },
          { status: 404 }
        );
      }

      if (!["scheduled", "arrived"].includes(visit.status)) {
        return NextResponse.json(
          {
            error: {
              code: "INVALID_STATE",
              message: `Cannot send "On My Way" for a visit with status '${visit.status}'`,
              traceId: session.traceId,
            },
          },
          { status: 422 }
        );
      }

      if (isEmailConfigured() && visit.client_email && visit.client_name && visit.job_title) {
        const when = new Date(visit.scheduled_start).toLocaleString("en-US", {
          weekday: "long", month: "long", day: "numeric",
          hour: "numeric", minute: "2-digit",
        });
        const emailResult = await sendEmail({
          to: visit.client_email,
          subject: `On My Way — ${visit.job_title}`,
          html: onMyWayEmailHtml({
            clientName: visit.client_name,
            jobTitle: visit.job_title,
            when,
            propertyAddress: visit.property_address,
            techName: visit.tech_name,
          }),
        });
        if (!emailResult.ok) {
          await logCommunication({
            accountId: session.accountId,
            channel: "email",
            direction: "outbound",
            outcome: "failed",
            clientId: visit.client_id,
            jobId: visit.job_id,
            visitId: id,
            bodyPreview: `On My Way — ${visit.job_title}`,
            initiatedBy: session.userId,
            externalId: emailResult.error ?? null,
          });
          logger.warn("[on-my-way] email send failed", { visitId: id, error: emailResult.error });
          return NextResponse.json(
            {
              error: {
                code: "EMAIL_FAILED",
                message: "Failed to send notification email",
                traceId: session.traceId,
              },
            },
            { status: 502 }
          );
        }
        await logCommunication({
          accountId: session.accountId,
          channel: "email",
          direction: "outbound",
          outcome: "sent",
          clientId: visit.client_id,
          jobId: visit.job_id,
          visitId: id,
          bodyPreview: `On My Way — ${visit.job_title}`,
          initiatedBy: session.userId,
        });
      }

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "on_my_way",
        entity_id: id,
        action: "insert",
        actor_id: session.userId,
        trace_id: session.traceId,
        old_value: null,
        new_value: { sent_at: new Date().toISOString(), client_email: visit.client_email },
      });

      return NextResponse.json({ data: { sent: true } });
    } catch (err) {
      logger.error("[on-my-way POST]", err, { traceId: session.traceId });
      return NextResponse.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to send on-my-way notification",
            traceId: session.traceId,
          },
        },
        { status: 500 }
      );
    } finally {
      client.release();
    }
  }
);
