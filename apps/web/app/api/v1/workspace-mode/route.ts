import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";

export const dynamic = "force-dynamic";

const COOKIE_NAME = "workspace_mode";
const ONE_YEAR = 60 * 60 * 24 * 365;

const bodySchema = z.object({
  mode: z.enum(["mobile", "desktop", "auto"]),
});

/**
 * POST /api/v1/workspace-mode
 *
 * Persists the user's workspace mode preference in a long-lived cookie.
 * Called by the workspace switcher in AppShell and the Settings page.
 * No DB write needed — cookie survives sessions on the same browser.
 */
export const POST = withAuth(async (request: NextRequest) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "mode must be 'mobile', 'desktop', or 'auto'" },
      { status: 422 }
    );
  }

  const { mode } = parsed.data;
  const res = NextResponse.json({ mode });

  res.cookies.set(COOKIE_NAME, mode, {
    path: "/",
    maxAge: ONE_YEAR,
    sameSite: "lax",
    // Not httpOnly so client JS can read it for optimistic UI if needed
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
  });

  return res;
});
