import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { endPortalPreview } from "@/lib/portal/session";
import { appUrl } from "@/lib/email/mailer";

// TASK-160: "Exit Preview" ends the preview login, then returns to the app.
export async function GET(request: NextRequest) {
  await endPortalPreview();
  const session = await getSession();
  const clientId = request.nextUrl.searchParams.get("client");
  const target = session && clientId && /^[0-9a-f-]{36}$/i.test(clientId)
    ? `/app/clients/${clientId}`
    : session ? "/app/clients" : "/portal/login";
  // request.url is the container's bind address (0.0.0.0) behind the proxy; use the public app URL.
  return NextResponse.redirect(new URL(target, appUrl()));
}
