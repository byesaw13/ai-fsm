/**
 * Android SMS Gateway send. Same payload as apps/web/lib/sms/gateway.ts.
 * The worker shares the production env file, so the three SMS_GATEWAY_* values
 * are already present when the phone gateway is configured.
 */

export type SmsSendResult =
  | { ok: true; messageId: string | null }
  | { ok: false; error: string };

export function smsGatewayConfigured(): boolean {
  return Boolean(
    process.env.SMS_GATEWAY_URL?.trim() &&
      process.env.SMS_GATEWAY_USERNAME?.trim() &&
      process.env.SMS_GATEWAY_PASSWORD?.trim()
  );
}

function authHeader(): string {
  const user = process.env.SMS_GATEWAY_USERNAME!.trim();
  const pass = process.env.SMS_GATEWAY_PASSWORD!.trim();
  return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
}

export async function sendSms(phone: string, message: string): Promise<SmsSendResult> {
  const url = process.env.SMS_GATEWAY_URL?.trim();
  if (!url || !smsGatewayConfigured()) {
    return { ok: false, error: "SMS gateway is not configured" };
  }
  const sim = Number(process.env.SMS_GATEWAY_SIM_NUMBER ?? "1");
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        textMessage: { text: message },
        phoneNumbers: [phone],
        simNumber: Number.isFinite(sim) && sim > 0 ? sim : 1,
        withDeliveryReport: true,
      }),
    });
    const text = await res.text();
    let json: { id?: string; message?: string } = {};
    try {
      json = text ? (JSON.parse(text) as { id?: string; message?: string }) : {};
    } catch {
      json = {};
    }
    if (!res.ok) {
      return { ok: false, error: json.message || text.slice(0, 200) || `Gateway HTTP ${res.status}` };
    }
    return { ok: true, messageId: json.id ?? null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "SMS gateway request failed" };
  }
}

/** Newest device check-in, or null when the gateway cannot be asked. */
export async function gatewayLastSeen(): Promise<Date | null> {
  if (!smsGatewayConfigured()) return null;
  const res = await fetch("https://api.sms-gate.app/3rdparty/v1/devices", {
    headers: { Authorization: authHeader(), Accept: "application/json" },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as Array<{ lastSeen?: string }> | { lastSeen?: string };
  const device = Array.isArray(data) ? data[0] : data;
  if (!device?.lastSeen) return null;
  const seen = new Date(device.lastSeen);
  return Number.isNaN(seen.getTime()) ? null : seen;
}
