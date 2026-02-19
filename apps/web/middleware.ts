import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js Edge Middleware — adds security response headers to every response.
 *
 * Runs at the Edge before route handlers. This is the canonical place for
 * response-level security controls that apply globally.
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // ── Security headers ──────────────────────────────────────────────
  // Prevent clickjacking
  response.headers.set("X-Frame-Options", "DENY");

  // Prevent MIME-type sniffing
  response.headers.set("X-Content-Type-Options", "nosniff");

  // Referrer policy — send origin only on cross-origin
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Permissions policy — disable unused browser features
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()"
  );

  // Content-Security-Policy — restrictive baseline
  // self for scripts/styles, inline styles allowed for Next.js
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ")
  );

  // Strict-Transport-Security — enforce HTTPS (respected by browsers after first visit)
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains"
  );

  return response;
}

/**
 * Match all routes except Next.js internals and static assets.
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)",
  ],
};
