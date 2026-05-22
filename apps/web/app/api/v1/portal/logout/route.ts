import { NextResponse } from "next/server";
import { PORTAL_SESSION_COOKIE } from "@/lib/portal/session";
import { appUrl } from "@/lib/email/mailer";

export async function POST() {
  const response = NextResponse.redirect(new URL("/portal/login", appUrl()));
  response.cookies.delete(PORTAL_SESSION_COOKIE);
  return response;
}
