/**
 * POST /api/internal/phone/check-in — the Dovetails Phone app says it is awake
 * (TASK-260). Feeds the "Business phone is offline" alert. Returns how many
 * texts are waiting so the app can pull them at once.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getOwnerContext, pendingOutboxCount, recordDeviceCheckIn } from "@/lib/db/phone";
import { phoneAppAuthorized } from "@/lib/phone-app/ingest";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  device_id: z.string().min(1).max(100),
  label: z.string().max(100).optional().nullable(),
  app_version: z.string().max(40).optional().nullable(),
  status: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: NextRequest) {
  if (!phoneAppAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }
  try {
    const { accountId } = await getOwnerContext();
    await recordDeviceCheckIn(accountId, {
      deviceId: parsed.data.device_id,
      label: parsed.data.label,
      appVersion: parsed.data.app_version,
      status: parsed.data.status,
    });
    const pending = await pendingOutboxCount(accountId);
    return NextResponse.json({ ok: true, server_time: new Date().toISOString(), pending });
  } catch (err) {
    logger.error("phone check-in failed", err as Error);
    return NextResponse.json({ error: "Check-in failed" }, { status: 500 });
  }
}
