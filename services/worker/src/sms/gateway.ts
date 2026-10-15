/**
 * The worker has no internet egress. Service texts are sent by the web tier,
 * which can reach the Android SMS gateway. Both containers share the env file,
 * so SMS_INTERNAL_KEY is present here. SMS_WEB_URL defaults to the compose
 * service name on the internal network.
 */

export type SmsSendResult =
  | { ok: true; messageId: string | null }
  | { ok: false; error: string };

export type GatewayHealth =
  | { configured: false }
  | { configured: true; lastSeen: Date | null };

function webBase(): string {
  return (process.env.SMS_WEB_URL || "http://web:3000").replace(/\/$/, "");
}

export function smsGatewayConfigured(): boolean {
  return Boolean(process.env.SMS_INTERNAL_KEY?.trim());
}

export async function sendSms(phone: string, message: string): Promise<SmsSendResult> {
  const key = process.env.SMS_INTERNAL_KEY?.trim();
  if (!key) return { ok: false, error: "SMS dispatch is not configured" };
  try {
    const res = await fetch(`${webBase()}/api/internal/sms/dispatch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-api-key": key,
      },
      body: JSON.stringify({ phone, message }),
    });
    const text = await res.text();
    let json: { ok?: boolean; messageId?: string | null; error?: string } = {};
    try {
      json = text ? (JSON.parse(text) as typeof json) : {};
    } catch {
      json = {};
    }
    if (!res.ok || json.ok === false) {
      return { ok: false, error: json.error || text.slice(0, 200) || `Dispatch HTTP ${res.status}` };
    }
    return { ok: true, messageId: json.messageId ?? null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "SMS dispatch request failed" };
  }
}

/** Asks the web tier when the business phone last checked in. */
export async function gatewayHealth(): Promise<GatewayHealth> {
  const key = process.env.SMS_INTERNAL_KEY?.trim();
  if (!key) return { configured: false };
  const res = await fetch(`${webBase()}/api/internal/sms/dispatch`, {
    headers: { Accept: "application/json", "x-api-key": key },
  });
  if (!res.ok) throw new Error(`sms health HTTP ${res.status}`);
  const data = (await res.json()) as { configured?: boolean; lastSeen?: string | null };
  if (!data.configured) return { configured: false };
  if (!data.lastSeen) return { configured: true, lastSeen: null };
  const seen = new Date(data.lastSeen);
  return { configured: true, lastSeen: Number.isNaN(seen.getTime()) ? null : seen };
}
