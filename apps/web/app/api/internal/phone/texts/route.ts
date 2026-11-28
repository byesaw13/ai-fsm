/**
 * POST /api/internal/phone/texts — texts the owner typed in the phone's own
 * Messages app (TASK-260). Kept only for customers' numbers. Customer texts
 * coming in use /api/internal/sms instead.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getOwnerContext } from "@/lib/db/phone";
import { ingestOwnText, phoneAppAuthorized, type IngestResult } from "@/lib/phone-app/ingest";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  texts: z
    .array(
      z.object({
        id: z.string().min(1).max(200),
        phone: z.string().min(3).max(30),
        body: z.string().max(5000),
        sent_at: z.string().datetime({ offset: true }),
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
    const { accountId, userId } = await getOwnerContext();
    const results: Record<string, IngestResult> = {};
    for (const t of parsed.data.texts) {
      results[t.id] = await ingestOwnText(accountId, userId, {
        id: t.id,
        phone: t.phone,
        body: t.body,
        sentAt: new Date(t.sent_at),
      });
    }
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    logger.error("phone texts ingest failed", err as Error);
    return NextResponse.json({ error: "Texts failed" }, { status: 500 });
  }
}
