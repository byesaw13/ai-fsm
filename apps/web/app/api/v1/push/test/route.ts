/**
 * POST /api/v1/push/test — send a test push to the caller's own devices.
 * The end-to-end proof: subscribe, then hit this and confirm the OS
 * notification arrives (with the app closed).
 */
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { logger } from "@/lib/logger";
import { isPushConfigured } from "@/lib/push/vapid";
import { sendPushToUser } from "@/lib/push/send";

export const dynamic = "force-dynamic";

export const POST = withAuth(async (_request: NextRequest, session) => {
  if (!isPushConfigured()) {
    return NextResponse.json(
      { error: { code: "PUSH_NOT_CONFIGURED", message: "Push isn't configured on this server.", traceId: session.traceId } },
      { status: 503 },
    );
  }
  try {
    const sent = await sendPushToUser(session.accountId, session.userId, {
      title: "Dovetails test",
      body: "Push notifications are working.",
      url: "/app",
      tag: "dovetails-test",
    });
    return NextResponse.json({ data: { sent } });
  } catch (error) {
    logger.error("POST /api/v1/push/test error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to send test push", traceId: session.traceId } },
      { status: 500 },
    );
  }
});
