/**
 * Android SMS Gateway (capcom6 / sms-gate.app) send helper.
 *
 * Env:
 *   SMS_GATEWAY_URL      Full messages endpoint, e.g.
 *                        https://api.sms-gate.app/3rdparty/v1/messages
 *                        or http://192.168.x.x:8080/message (local server)
 *   SMS_GATEWAY_USERNAME Basic-auth username from the app Home tab
 *   SMS_GATEWAY_PASSWORD Basic-auth password
 *   SMS_GATEWAY_SIM_NUMBER Optional SIM slot (default 1 = business line)
 *
 * TASK-260: SMS_TRANSPORT=phone_app sends through our own Dovetails Phone app
 * instead. The text is queued in phone_outbox; the phone pulls it, sends it,
 * and reports back. messageId is the outbox id, so the phone's report updates
 * the logged text. Needs PHONE_APP_KEY. Default transport stays the gateway.
 */
import { enqueuePhoneText, getOwnerContext, phoneLastSeen } from "@/lib/db/phone";

export type SendSmsResult =
  | { ok: true; messageId: string; raw?: unknown }
  | { ok: false; error: string; status?: number };

export function usesPhoneApp(): boolean {
  return process.env.SMS_TRANSPORT?.trim() === "phone_app";
}

export function isSmsGatewayConfigured(): boolean {
  if (usesPhoneApp()) return Boolean(process.env.PHONE_APP_KEY?.trim());
  return Boolean(
    process.env.SMS_GATEWAY_URL?.trim() &&
      process.env.SMS_GATEWAY_USERNAME?.trim() &&
      process.env.SMS_GATEWAY_PASSWORD?.trim()
  );
}

export async function sendSmsViaGateway(opts: {
  phone: string;
  message: string;
  /** Optional idempotency / correlation id */
  id?: string;
}): Promise<SendSmsResult> {
  if (usesPhoneApp()) return queueForPhoneApp(opts.phone, opts.message);
  const url = process.env.SMS_GATEWAY_URL?.trim();
  const username = process.env.SMS_GATEWAY_USERNAME?.trim();
  const password = process.env.SMS_GATEWAY_PASSWORD?.trim();
  const simNumber = Number(process.env.SMS_GATEWAY_SIM_NUMBER || "1");

  if (!url || !username || !password) {
    return {
      ok: false,
      error:
        "SMS gateway not configured. Set SMS_GATEWAY_URL, SMS_GATEWAY_USERNAME, and SMS_GATEWAY_PASSWORD.",
    };
  }

  const auth = Buffer.from(`${username}:${password}`).toString("base64");
  // Cloud API uses textMessage; local server accepts the same modern shape.
  const payload: Record<string, unknown> = {
    textMessage: { text: opts.message },
    phoneNumbers: [opts.phone],
    simNumber: Number.isFinite(simNumber) && simNumber > 0 ? simNumber : 1,
    withDeliveryReport: true,
  };
  if (opts.id) payload.id = opts.id;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }

    if (!res.ok) {
      const msg =
        typeof json === "object" && json && "message" in json
          ? String((json as { message: unknown }).message)
          : text.slice(0, 200) || `HTTP ${res.status}`;
      return { ok: false, error: msg, status: res.status };
    }

    const messageId =
      (typeof json === "object" &&
        json &&
        "id" in json &&
        typeof (json as { id: unknown }).id === "string" &&
        (json as { id: string }).id) ||
      opts.id ||
      `sms-send-${Date.now()}`;

    return { ok: true, messageId, raw: json };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "SMS gateway request failed",
    };
  }
}

async function queueForPhoneApp(phone: string, message: string): Promise<SendSmsResult> {
  if (!process.env.PHONE_APP_KEY?.trim()) {
    return { ok: false, error: "Dovetails Phone is not configured. Set PHONE_APP_KEY." };
  }
  try {
    const { accountId } = await getOwnerContext();
    const id = await enqueuePhoneText(accountId, phone, message);
    return { ok: true, messageId: id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not queue the text" };
  }
}

/** Newest device check-in. Null when the gateway answers but no device has checked in. */
export async function gatewayDevicesLastSeen(): Promise<Date | null> {
  if (usesPhoneApp()) {
    if (!isSmsGatewayConfigured()) return null;
    const { accountId } = await getOwnerContext();
    return phoneLastSeen(accountId);
  }
  const username = process.env.SMS_GATEWAY_USERNAME?.trim();
  const password = process.env.SMS_GATEWAY_PASSWORD?.trim();
  if (!username || !password || !isSmsGatewayConfigured()) return null;
  const auth = Buffer.from(`${username}:${password}`).toString("base64");
  const res = await fetch("https://api.sms-gate.app/3rdparty/v1/devices", {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as Array<{ lastSeen?: string }> | { lastSeen?: string };
  const device = Array.isArray(data) ? data[0] : data;
  if (!device?.lastSeen) return null;
  const seen = new Date(device.lastSeen);
  return Number.isNaN(seen.getTime()) ? null : seen;
}
