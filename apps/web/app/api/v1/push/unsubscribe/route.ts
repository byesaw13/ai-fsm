/**
 * POST /api/v1/push/unsubscribe — remove a Web Push subscription by endpoint.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import { withDbSession } from "@/lib/db";
import { logger } from "@/lib/logger";
import { deleteSubscription } from "@/lib/push/subscriptions";

export const dynamic = "force-dynamic";

const schema = z.object({ endpoint: z.string().url().max(2000) });

export const POST = withAuth(async (request: NextRequest, session) => {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid endpoint", traceId: session.traceId } },
      { status: 400 },
    );
  }
  try {
    await withDbSession(session, (client) =>
      deleteSubscription(client, session.accountId, parsed.data.endpoint),
    );
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    logger.error("POST /api/v1/push/unsubscribe error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to remove subscription", traceId: session.traceId } },
      { status: 500 },
    );
  }
});
