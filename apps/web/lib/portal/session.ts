import { cookies } from "next/headers";
import { query, queryOne } from "@/lib/db";

export const PORTAL_SESSION_COOKIE = "portal_session";
const SESSION_DAYS = 30;

/** Staff "view as client" sessions are short-lived and read-only (TASK-160). */
export const PREVIEW_SESSION_SECONDS = 2 * 60 * 60;
export const PREVIEW_READ_ONLY_MESSAGE = "Admin preview is read-only";

export async function createPortalSession(
  clientId: string,
  opts: { preview?: boolean } = {},
): Promise<string> {
  const rows = await query<{ token: string }>(
    `INSERT INTO portal_sessions (client_id, expires_at, is_preview)
     VALUES ($1, now() + make_interval(secs => $2), $3)
     RETURNING token::text`,
    [clientId, opts.preview ? PREVIEW_SESSION_SECONDS : SESSION_DAYS * 24 * 60 * 60, opts.preview === true]
  );
  return rows[0].token;
}

export async function getPortalSession(): Promise<{ clientId: string; isPreview: boolean } | null> {
  const jar = await cookies();
  const token = jar.get(PORTAL_SESSION_COOKIE)?.value;
  if (!token) return null;

  const row = await queryOne<{ client_id: string; is_preview: boolean }>(
    `SELECT client_id::text, is_preview
     FROM portal_sessions
     WHERE token = $1 AND expires_at > now()`,
    [token]
  );
  return row ? { clientId: row.client_id, isPreview: row.is_preview } : null;
}

/** True when this browser is in a staff "view as client" preview. */
export async function isPortalPreview(): Promise<boolean> {
  return (await getPortalSession())?.isPreview === true;
}

/** Ends a preview session (never a real client login) and clears its cookie. */
export async function endPortalPreview(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(PORTAL_SESSION_COOKIE)?.value;
  if (!token) return;
  const ended = await query<{ token: string }>(
    `DELETE FROM portal_sessions WHERE token = $1 AND is_preview = true RETURNING token::text`,
    [token]
  );
  if (ended.length > 0) jar.delete(PORTAL_SESSION_COOKIE);
}

export async function setPortalSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(PORTAL_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.SECURE_COOKIES !== "false" && process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    path: "/",
  });
}

export async function clearPortalSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(PORTAL_SESSION_COOKIE);
}
