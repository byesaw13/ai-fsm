/**
 * POST /api/internal/phone/calls — call records from the business phone
 * (TASK-260). Kept only for customers' numbers; no audio, ever.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getOwnerContext } from "@/lib/db/phone";
import { ingestCall, phoneAppAuthorized, type IngestResult } from "@/lib/phone-app/ingest";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  calls: z
    .array(
      z.object({
        id: z.string().min(1).max(200),
        phone: z.string().min(3).max(30),
        direction: z.enum(["inbound", "outbound"]),
        result: z.enum(["answered", "missed", "rejected", "voicemail", "blocked"]),
        started_at: z.string().datetime({ offset: true }),
        duration_seconds: z.number().int().min(0).max(86_400),
      }),
    )
    .min(1)
    .max(100),
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
    const results: Record<string, IngestResult> = {};
    for (const c of parsed.data.calls) {
      results[c.id] = await ingestCall(accountId, {
        id: c.id,
        phone: c.phone,
        direction: c.direction,
        result: c.result,
        startedAt: new Date(c.started_at),
        durationSeconds: c.duration_seconds,
      });
    }
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    logger.error("phone calls ingest failed", err as Error);
    return NextResponse.json({ error: "Calls failed" }, { status: 500 });
  }
}
