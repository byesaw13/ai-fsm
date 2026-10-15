/**
 * POST /api/internal/sms/dispatch — send one service text.
 * GET  /api/internal/sms/dispatch — phone check-in time.
 *
 * The worker has no internet egress. It queues the text, then asks the web
 * tier to talk to the Android SMS gateway.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import {
  gatewayDevicesLastSeen,
  isSmsGatewayConfigured,
  sendSmsViaGateway,
} from "@/lib/sms/gateway";

export const dynamic = "force-dynamic";

const KEY = process.env.SMS_INTERNAL_KEY;

const bodySchema = z.object({
  phone: z.string().min(7).max(20),
  message: z.string().min(1).max(1600),
});

function authorized(req: NextRequest): boolean {
  return Boolean(KEY) && req.headers.get("x-api-key") === KEY;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSmsGatewayConfigured()) {
    return NextResponse.json({ configured: false, lastSeen: null });
  }
  try {
    const lastSeen = await gatewayDevicesLastSeen();
    return NextResponse.json({
      configured: true,
      lastSeen: lastSeen ? lastSeen.toISOString() : null,
    });
  } catch (err) {
    logger.warn("sms dispatch health failed", { error: (err as Error).message });
    return NextResponse.json({ error: "Gateway health check failed" }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 422 });
  }
  const result = await sendSmsViaGateway({
    phone: parsed.data.phone,
    message: parsed.data.message,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true, messageId: result.messageId });
}
