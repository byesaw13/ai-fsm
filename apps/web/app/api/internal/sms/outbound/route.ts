import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { queryOne } from "@/lib/db";
import { logger } from "@/lib/logger";
import { normalizePhone } from "@/lib/phone";
import {
  findActiveJobForClient,
  findClientByPhone,
  logOutboundSms,
  updateOutboundSmsOutcome,
  type OutboundSmsOutcome,
} from "@/lib/sms/outbound";

export const dynamic = "force-dynamic";

const SMS_KEY = process.env.SMS_INTERNAL_KEY;

/**
 * Accept either a flat body (from n8n after extraction) or a raw SMS Gateway
 * webhook envelope (event + payload).
 */
const flatSchema = z.object({
  /** Customer phone (recipient for outbound) */
  phone: z.string().min(7).max(30),
  message: z.string().max(2000).optional().nullable(),
  external_id: z.string().max(255).optional().nullable(),
  outcome: z.enum(["sent", "delivered", "failed"]).optional(),
  sim_number: z.number().int().optional().nullable(),
});

async function getOwnerAccountId(): Promise<string> {
  const row = await queryOne<{ account_id: string }>(
    `SELECT a.id AS account_id
     FROM accounts a JOIN users u ON u.account_id = a.id
     WHERE u.role = 'owner' ORDER BY u.created_at LIMIT 1`
  );
  if (!row) throw new Error("No owner account found");
  return row.account_id;
}

function extractFromGatewayEnvelope(body: unknown): {
  phone: string;
  message: string | null;
  external_id: string | null;
  outcome: OutboundSmsOutcome;
  simNumber: number | null;
} | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const event = typeof b.event === "string" ? b.event : null;
  const payload =
    b.payload && typeof b.payload === "object"
      ? (b.payload as Record<string, unknown>)
      : b;

  // Only outbound lifecycle events from the Android gateway
  const eventOutcome: OutboundSmsOutcome | null =
    event === "sms:sent"
      ? "sent"
      : event === "sms:delivered"
        ? "delivered"
        : event === "sms:failed"
          ? "failed"
          : event === null
            ? null
            : null;

  // If envelope has an inbound event, this endpoint is the wrong place
  if (event === "sms:received" || event === "mms:received") return null;

  const recipient = String(
    payload.recipient ?? payload.phone ?? payload.phoneNumber ?? b.phone ?? ""
  ).trim();
  if (!recipient) return null;

  // sms:sent does not include message text; accept if present from n8n enrichment
  const messageRaw = payload.message ?? payload.text ?? b.message ?? null;
  const message =
    typeof messageRaw === "string" && messageRaw.trim()
      ? messageRaw.trim()
      : null;

  const messageId = String(
    payload.messageId ?? payload.id ?? b.external_id ?? b.id ?? ""
  ).trim();

  const simRaw = payload.simNumber ?? b.sim_number;
  const simNumber =
    typeof simRaw === "number"
      ? simRaw
      : typeof simRaw === "string" && simRaw
        ? Number(simRaw)
        : null;

  // Default outcome when flat body without event
  const outcome: OutboundSmsOutcome = eventOutcome ?? "sent";

  return {
    phone: recipient,
    message,
    external_id: messageId || null,
    outcome,
    simNumber: Number.isFinite(simNumber as number) ? (simNumber as number) : null,
  };
}

// ── POST /api/internal/sms/outbound ───────────────────────────────────────
// Logs outbound SMS from the Android SMS Gateway (sms:sent / delivered / failed)
// or a simplified n8n payload. Does NOT create jobs or call Claude.
export async function POST(req: NextRequest) {
  const traceId = randomUUID();

  if (!SMS_KEY || req.headers.get("x-api-key") !== SMS_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Prefer gateway envelope parse; fall back to flat schema
  let phone: string;
  let message: string | null;
  let externalId: string | null;
  let outcome: OutboundSmsOutcome;
  let simNumber: number | null;

  const fromEnvelope = extractFromGatewayEnvelope(body);
  if (fromEnvelope) {
    phone = fromEnvelope.phone;
    message = fromEnvelope.message;
    externalId = fromEnvelope.external_id;
    outcome = fromEnvelope.outcome;
    simNumber = fromEnvelope.simNumber;
  } else {
    const parsed = flatSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 422 }
      );
    }
    phone = parsed.data.phone;
    message = parsed.data.message?.trim() || null;
    externalId = parsed.data.external_id ?? null;
    outcome = parsed.data.outcome ?? "sent";
    simNumber = parsed.data.sim_number ?? null;
  }

  // Business SIM only (same rule as inbound n8n filter)
  if (simNumber !== null && simNumber !== 1) {
    return NextResponse.json({ skipped: true, reason: "non_business_sim", simNumber });
  }

  const normalized = normalizePhone(phone) ?? phone;

  let accountId: string;
  try {
    accountId = await getOwnerAccountId();
  } catch (err) {
    logger.error("outbound SMS: owner context", err as Error, { traceId });
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  // Delivery/failure updates for a message we already logged as sent
  if (externalId && (outcome === "delivered" || outcome === "failed")) {
    const updated = await updateOutboundSmsOutcome(accountId, externalId, outcome);
    if (updated) {
      logger.info("outbound SMS outcome updated", { traceId, externalId, outcome });
      return NextResponse.json({ updated: true, outcome, external_id: externalId });
    }
    // Fall through to insert if we never saw the send (e.g. only delivery webhook)
  }

  const client = await findClientByPhone(accountId, normalized);
  const clientId = client?.id ?? null;
  let jobId: string | null = null;
  if (clientId) {
    jobId = await findActiveJobForClient(accountId, clientId);
  }

  const bodyPreview =
    message ??
    (outcome === "failed"
      ? "SMS failed (text not provided by gateway)"
      : "SMS sent from phone (text not provided by gateway)");

  const commsId = await logOutboundSms({
    accountId,
    clientId,
    jobId,
    bodyPreview,
    outcome: outcome === "delivered" ? "delivered" : outcome === "failed" ? "failed" : "sent",
    externalId,
  });

  if (externalId && commsId === null) {
    // Duplicate send event — if this is a later status, try update
    if (outcome === "delivered" || outcome === "failed") {
      await updateOutboundSmsOutcome(accountId, externalId, outcome);
    }
    return NextResponse.json({ duplicate: true, external_id: externalId });
  }

  logger.info("outbound SMS logged", {
    traceId,
    clientId,
    jobId,
    outcome,
    externalId,
    hasText: Boolean(message),
  });

  return NextResponse.json({
    logged: true,
    communication_id: commsId,
    client_id: clientId,
    job_id: jobId,
    outcome,
    external_id: externalId,
  });
}
