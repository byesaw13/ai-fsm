import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { createPortalSession, PORTAL_SESSION_COOKIE } from "@/lib/portal/session";
import { appUrl } from "@/lib/email/mailer";

const SESSION_DAYS = 30;

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/portal/login?error=invalid", appUrl()));
  }

  // Atomically validate and consume the magic link, fetching the client's portal_token
  const rows = await query<{ client_id: string; portal_token: string }>(
    `UPDATE portal_magic_links ml
     SET used_at = now()
     FROM clients c
     WHERE ml.token = $1
       AND ml.used_at IS NULL
       AND ml.expires_at > now()
       AND c.id = ml.client_id
     RETURNING ml.client_id::text, c.portal_token::text`,
    [token]
  );

  if (rows.length === 0) {
    return NextResponse.redirect(new URL("/portal/login?error=expired", appUrl()));
  }

  const { client_id, portal_token } = rows[0];
  const sessionToken = await createPortalSession(client_id);

  const response = NextResponse.redirect(new URL(`/portal/${portal_token}`, appUrl()));
  response.cookies.set(PORTAL_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    path: "/",
  });

  return response;
}
