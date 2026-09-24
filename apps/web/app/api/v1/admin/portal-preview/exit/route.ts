import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { endPortalPreview } from "@/lib/portal/session";

// TASK-160: "Exit Preview" ends the preview login, then returns to the app.
export async function GET(request: NextRequest) {
  await endPortalPreview();
  const session = await getSession();
  const clientId = request.nextUrl.searchParams.get("client");
  const target = session && clientId && /^[0-9a-f-]{36}$/i.test(clientId)
    ? `/app/clients/${clientId}`
    : session ? "/app/clients" : "/portal/login";
  return NextResponse.redirect(new URL(target, request.url));
}
