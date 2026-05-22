import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { appUrl } from "@/lib/email/mailer";

// GET: validate only — do NOT consume the token here.
// Email scanners and prefetchers hit GET links before the user does; consuming on
// GET would burn the token before it can be used. The confirm page handles consumption.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/portal/login?error=invalid", appUrl()));
  }

  // Validate without consuming
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM portal_magic_links
     WHERE token = $1 AND used_at IS NULL AND expires_at > now()`,
    [token]
  );

  if (!row) {
    return NextResponse.redirect(new URL("/portal/login?error=expired", appUrl()));
  }

  return NextResponse.redirect(
    new URL(`/portal/auth/confirm?token=${encodeURIComponent(token)}`, appUrl())
  );
}
