/**
 * POST /api/internal/email — the worker's queued emails go out here (TASK-256).
 *
 * The worker runs on the internal-only network and cannot reach SMTP, so it
 * hands each message to the web tier, which can. Internal-key protected,
 * mirroring the other api/internal routes. The worker keeps retries, quiet
 * hours and cooldowns; this route only sends.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendEmail } from "@/lib/email/mailer";

export const dynamic = "force-dynamic";

const KEY = process.env.LOCATION_INTERNAL_KEY;

const bodySchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(500),
  html: z.string().min(1),
  text: z.string().optional(),
});

export async function POST(req: NextRequest) {
  if (!KEY || req.headers.get("x-api-key") !== KEY) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid email" }, { status: 400 });
  }
  const result = await sendEmail(parsed.data);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
