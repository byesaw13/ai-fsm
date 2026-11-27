/**
 * POST /api/internal/phone/outbox — the phone asks for texts to send
 * (TASK-260). Old texts are failed first so a late "on the way" never goes out.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { claimOutbox, expireStaleOutbox, getOwnerContext } from "@/lib/db/phone";
import { phoneAppAuthorized } from "@/lib/phone-app/ingest";
import { updateOutboundSmsOutcome } from "@/lib/sms/outbound";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  device_id: z.string().min(1).max(100),
  limit: z.number().int().min(1).max(25).optional(),
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
    const expired = await expireStaleOutbox(accountId);
    for (const id of expired) {
      await updateOutboundSmsOutcome(accountId, id, "failed");
    }
    if (expired.length > 0) logger.warn("phone outbox texts expired", { count: expired.length });
    const rows = await claimOutbox(accountId, parsed.data.device_id, parsed.data.limit ?? 10);
    return NextResponse.json({
      messages: rows.map((r) => ({ id: r.id, phone: r.to_phone, body: r.body })),
    });
  } catch (err) {
    logger.error("phone outbox claim failed", err as Error);
    return NextResponse.json({ error: "Outbox failed" }, { status: 500 });
  }
}
