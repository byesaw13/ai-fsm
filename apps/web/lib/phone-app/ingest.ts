/**
 * Dovetails Phone (TASK-260): what the server keeps from the business phone's
 * call log and Sent folder.
 *
 * Rule: a call or a text the owner typed is kept only when the number matches
 * a customer. Personal calls and texts are dropped here and never stored.
 * Inbound texts do not come through here; they use /api/internal/sms, which
 * already sorts business from personal.
 */
import type { NextRequest } from "next/server";
import { getPool } from "@/lib/db";
import { wasSentFromOutbox } from "@/lib/db/phone";
import { logCommunication } from "@/lib/communications-log";
import { emitAttentionEvent } from "@/lib/attention/emit";
import { formatPhoneDisplay, normalizePhone } from "@/lib/phone";
import { findActiveJobForClient, findClientByPhone } from "@/lib/sms/outbound";

export function phoneAppAuthorized(req: NextRequest): boolean {
  const key = process.env.PHONE_APP_KEY?.trim();
  return Boolean(key) && req.headers.get("x-api-key") === key;
}

type CallDirection = "inbound" | "outbound";
/** What Android's call log says happened (CallLog.Calls.TYPE, simplified). */
type CallResult = "answered" | "missed" | "rejected" | "voicemail" | "blocked";
type CallOutcome = "answered" | "missed" | "left_voicemail" | "no_answer";

interface PhoneCallEvent {
  /** Stable per call on the phone; the same call uploaded twice is one row. */
  id: string;
  phone: string;
  direction: CallDirection;
  result: CallResult;
  startedAt: Date;
  durationSeconds: number;
}

interface PhoneTextEvent {
  id: string;
  phone: string;
  body: string;
  sentAt: Date;
}

export type IngestResult = "logged" | "duplicate" | "not_customer" | "ignored";

/** Null means the call is not worth keeping (a blocked number). */
export function callOutcome(
  direction: CallDirection,
  result: CallResult,
  durationSeconds: number,
): CallOutcome | null {
  if (result === "blocked") return null;
  if (direction === "outbound") return durationSeconds > 0 ? "answered" : "no_answer";
  if (result === "voicemail") return "left_voicemail";
  if (result === "missed" || result === "rejected") return "missed";
  return "answered";
}

function last10(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

export async function ingestCall(accountId: string, event: PhoneCallEvent): Promise<IngestResult> {
  const outcome = callOutcome(event.direction, event.result, event.durationSeconds);
  if (!outcome) return "ignored";
  const phone = normalizePhone(event.phone) ?? event.phone;
  const client = await findClientByPhone(accountId, phone);
  if (!client) return "not_customer";

  const jobId = await findActiveJobForClient(accountId, client.id);
  const logId = await logCommunication({
    accountId,
    channel: "phone",
    direction: event.direction,
    outcome,
    clientId: client.id,
    jobId,
    externalId: `phone-call:${event.id}`,
    durationSeconds: Math.max(0, Math.round(event.durationSeconds)),
    occurredAt: event.startedAt,
  });
  if (!logId) return "duplicate";

  if (event.direction === "inbound" && (outcome === "missed" || outcome === "left_voicemail")) {
    const db = await getPool().connect();
    try {
      // emitAttentionEvent uses a SAVEPOINT, which needs a transaction.
      await db.query("BEGIN");
      await emitAttentionEvent(db, {
        accountId,
        type: "call.missed",
        entityType: "client",
        entityId: client.id,
        title: outcome === "left_voicemail" ? `Voicemail from ${client.name}` : `Missed call from ${client.name}`,
        summary: `Call back ${formatPhoneDisplay(phone)}.`,
        href: `/app/clients/${client.id}`,
        dedupeKey: `call-missed:${logId}`,
      });
      await db.query("COMMIT");
    } catch (err) {
      await db.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      db.release();
    }
  }
  return "logged";
}

/** A text the owner typed in the phone's own Messages app. */
export async function ingestOwnText(
  accountId: string,
  ownerUserId: string,
  event: PhoneTextEvent,
): Promise<IngestResult> {
  const body = event.body.trim();
  if (!body) return "ignored";
  const phone = normalizePhone(event.phone) ?? event.phone;
  const client = await findClientByPhone(accountId, phone);
  if (!client) return "not_customer";
  // The app's own sends also land in the Sent folder; those are logged already.
  if (await wasSentFromOutbox(accountId, last10(phone), body)) return "duplicate";

  const jobId = await findActiveJobForClient(accountId, client.id);
  const logId = await logCommunication({
    accountId,
    channel: "sms",
    direction: "outbound",
    outcome: "sent",
    clientId: client.id,
    jobId,
    bodyPreview: body.slice(0, 1000),
    initiatedBy: ownerUserId,
    externalId: `phone-sms-out:${event.id}`,
    occurredAt: event.sentAt,
  });
  return logId ? "logged" : "duplicate";
}
