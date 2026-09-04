/**
 * POST /api/v1/push/subscribe — store the caller's Web Push subscription.
 * Idempotent per endpoint (re-subscribing refreshes keys). RLS ties the row to
 * the authed user.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import { withDbSession } from "@/lib/db";
import { logger } from "@/lib/logger";
import { saveSubscription } from "@/lib/push/subscriptions";

export const dynamic = "force-dynamic";

const schema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(500) }),
});

export const POST = withAuth(async (request: NextRequest, session) => {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid subscription", traceId: session.traceId } },
      { status: 400 },
    );
  }
  try {
    const ua = request.headers.get("user-agent")?.slice(0, 300) ?? null;
    await withDbSession(session, (client) =>
      saveSubscription(client, session.accountId, session.userId, parsed.data, ua),
    );
    return NextResponse.json({ data: { ok: true } }, { status: 201 });
  } catch (error) {
    logger.error("POST /api/v1/push/subscribe error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to save subscription", traceId: session.traceId } },
      { status: 500 },
    );
  }
});
