import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db";
import { logger } from "@/lib/logger";
import { normalizePhone } from "@/lib/phone";
import { isSmsGatewayConfigured, sendSmsViaGateway } from "@/lib/sms/gateway";
import {
  findActiveJobForClient,
  logOutboundSms,
} from "@/lib/sms/outbound";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  message: z.string().min(1).max(1600),
  /** Optional job to attach the communication to */
  job_id: z.string().uuid().optional().nullable(),
});

/**
 * POST /api/v1/clients/[id]/sms
 * Send an SMS to the client via Android SMS Gateway and log it outbound.
 */
export const POST = withRole(
  ["owner", "admin"],
  async (request: NextRequest, session: AuthSession) => {
    const clientId = request.url.match(/\/clients\/([^/]+)\/sms/)?.[1];
    if (!clientId) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Client not found", traceId: session.traceId } },
        { status: 404 }
      );
    }

    if (!isSmsGatewayConfigured()) {
      return NextResponse.json(
        {
          error: {
            code: "NOT_CONFIGURED",
            message:
              "SMS gateway is not configured. Set SMS_GATEWAY_URL, SMS_GATEWAY_USERNAME, and SMS_GATEWAY_PASSWORD on the web service.",
            traceId: session.traceId,
          },
        },
        { status: 503 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Invalid JSON", traceId: session.traceId } },
        { status: 400 }
      );
    }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request body",
            details: parsed.error.flatten().fieldErrors,
            traceId: session.traceId,
          },
        },
        { status: 422 }
      );
    }

    const client = await queryOne<{ id: string; name: string; phone: string | null }>(
      `SELECT id, name, phone FROM clients WHERE id = $1 AND account_id = $2`,
      [clientId, session.accountId]
    );
    if (!client) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Client not found", traceId: session.traceId } },
        { status: 404 }
      );
    }
    if (!client.phone) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Client has no phone number on file",
            traceId: session.traceId,
          },
        },
        { status: 422 }
      );
    }

    const phone = normalizePhone(client.phone);
    if (!phone) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: `Client phone "${client.phone}" is not a valid mobile number`,
            traceId: session.traceId,
          },
        },
        { status: 422 }
      );
    }

    let jobId = parsed.data.job_id ?? null;
    if (jobId) {
      const job = await queryOne<{ id: string }>(
        `SELECT id FROM jobs WHERE id = $1 AND account_id = $2 AND client_id = $3`,
        [jobId, session.accountId, clientId]
      );
      if (!job) {
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Job not found for this client", traceId: session.traceId } },
          { status: 404 }
        );
      }
    } else {
      jobId = await findActiveJobForClient(session.accountId, clientId);
    }

    const message = parsed.data.message.trim();
    const sendResult = await sendSmsViaGateway({ phone, message });

    if (!sendResult.ok) {
      await logOutboundSms({
        accountId: session.accountId,
        clientId,
        jobId,
        bodyPreview: message,
        outcome: "failed",
        externalId: null,
        initiatedBy: session.userId,
      });
      logger.warn("[clients sms] gateway send failed", {
        traceId: session.traceId,
        clientId,
        error: sendResult.error,
        status: sendResult.status,
      });
      return NextResponse.json(
        {
          error: {
            code: "SMS_SEND_FAILED",
            message: sendResult.error,
            traceId: session.traceId,
          },
        },
        { status: 502 }
      );
    }

    const commsId = await logOutboundSms({
      accountId: session.accountId,
      clientId,
      jobId,
      bodyPreview: message,
      outcome: "sent",
      externalId: sendResult.messageId,
      initiatedBy: session.userId,
    });

    logger.info("[clients sms] sent", {
      traceId: session.traceId,
      clientId,
      jobId,
      messageId: sendResult.messageId,
      communicationId: commsId,
    });

    return NextResponse.json({
      data: {
        communication_id: commsId,
        message_id: sendResult.messageId,
        phone,
        job_id: jobId,
        outcome: "sent",
      },
    });
  }
);
