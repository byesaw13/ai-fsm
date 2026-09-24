import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canManageClients } from "@/lib/auth/permissions";
import { queryOneForSession } from "@/lib/db";
import { createPortalSession, PORTAL_SESSION_COOKIE, PREVIEW_SESSION_SECONDS } from "@/lib/portal/session";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const session = await getSession();
  if (!session || !canManageClients(session.role)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { clientId } = await params;

  const client = await queryOneForSession<{ id: string; portal_token: string }>(
    session,
    `SELECT id, portal_token FROM clients WHERE id = $1 AND account_id = $2`,
    [clientId, session.accountId]
  );

  if (!client) {
    return new NextResponse("Client not found", { status: 404 });
  }

  // TASK-160: short-lived, read-only preview session (not a real client login).
  const sessionToken = await createPortalSession(client.id, { preview: true });

  const url = new URL(`/portal/${client.portal_token}`, request.url);
  const response = NextResponse.redirect(url);
  response.cookies.set(PORTAL_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.SECURE_COOKIES !== "false" && process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: PREVIEW_SESSION_SECONDS,
    path: "/",
  });

  return response;
}
