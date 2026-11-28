/**
 * POST /api/internal/phone/outbox/report — what the phone did with each text
 * (TASK-260). Updates the outbox row and the logged text's outcome.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getOwnerContext, reportOutbox } from "@/lib/db/phone";
import { phoneAppAuthorized } from "@/lib/phone-app/ingest";
import { updateOutboundSmsOutcome } from "@/lib/sms/outbound";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  reports: z
    .array(
      z.object({
        id: z.string().uuid(),
        status: z.enum(["sent", "delivered", "failed"]),
        error: z.string().max(500).optional().nullable(),
      }),
    )
    .min(1)
    .max(50),
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
    const accepted: string[] = [];
    for (const r of parsed.data.reports) {
      const changed = await reportOutbox(accountId, r.id, r.status, r.error ?? null);
      if (changed) {
        await updateOutboundSmsOutcome(accountId, r.id, r.status);
      }
      // Unknown or stale reports are acknowledged too, so the phone stops retrying them.
      accepted.push(r.id);
    }
    return NextResponse.json({ ok: true, accepted });
  } catch (err) {
    logger.error("phone outbox report failed", err as Error);
    return NextResponse.json({ error: "Report failed" }, { status: 500 });
  }
}
