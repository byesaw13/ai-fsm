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
 */

export type SendSmsResult =
  | { ok: true; messageId: string; raw?: unknown }
  | { ok: false; error: string; status?: number };

export function isSmsGatewayConfigured(): boolean {
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
