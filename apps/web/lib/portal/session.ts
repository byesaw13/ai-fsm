import { cookies } from "next/headers";
import { query, queryOne } from "@/lib/db";

export const PORTAL_SESSION_COOKIE = "portal_session";
const SESSION_DAYS = 30;

export async function createPortalSession(clientId: string): Promise<string> {
  const rows = await query<{ token: string }>(
    `INSERT INTO portal_sessions (client_id, expires_at)
     VALUES ($1, now() + interval '30 days')
     RETURNING token::text`,
    [clientId]
  );
  return rows[0].token;
}

export async function getPortalSession(): Promise<{ clientId: string } | null> {
  const jar = await cookies();
  const token = jar.get(PORTAL_SESSION_COOKIE)?.value;
  if (!token) return null;

  const row = await queryOne<{ client_id: string }>(
    `SELECT client_id::text
     FROM portal_sessions
     WHERE token = $1 AND expires_at > now()`,
    [token]
  );
  return row ? { clientId: row.client_id } : null;
}

export async function setPortalSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(PORTAL_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    path: "/",
  });
}

export async function clearPortalSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(PORTAL_SESSION_COOKIE);
}
