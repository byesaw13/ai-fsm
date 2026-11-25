/**
 * The worker cannot reach SMTP (internal-only network), so email goes out
 * through the web tier's /api/internal/email (TASK-256).
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.LOCATION_INTERNAL_KEY;
  if (!key) return { ok: false, error: "Email not configured (LOCATION_INTERNAL_KEY missing)" };
  const base = (process.env.WEB_INTERNAL_URL ?? "http://web:3000").replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/api/internal/email`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key },
      body: JSON.stringify(opts),
      signal: AbortSignal.timeout(180_000), // longer than the web mailer's SMTP timeouts
    });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    return res.ok && body.ok ? { ok: true } : { ok: false, error: body.error ?? `web returned ${res.status}` };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
