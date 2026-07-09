import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import { logger } from "@ai-fsm/log/web";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  visit_id: z.string().uuid(),
  days: z.number().int().min(1).max(30).default(7),
});

export const POST = withAuth(async (request, session) => {
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid request", traceId: session.traceId } },
      { status: 422 },
    );
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true), set_config('app.current_account_id', $2, true), set_config('app.current_role', $3, true)`,
      [session.userId, session.accountId, session.role],
    );
    const promptKey = `estimate_not_started:${parsed.data.visit_id}`;
    await client.query(
      `INSERT INTO user_prompt_mutes (account_id, user_id, prompt_key, muted_until)
       VALUES ($1, $2, $3, now() + ($4::text || ' days')::interval)
       ON CONFLICT (account_id, user_id, prompt_key)
       DO UPDATE SET muted_until = EXCLUDED.muted_until`,
      [session.accountId, session.userId, promptKey, String(parsed.data.days)],
    );
    return NextResponse.json({ data: { muted: true, days: parsed.data.days } });
  } catch (error) {
    logger.error("POST /api/v1/field/estimate-reminders/mute error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to mute reminder", traceId: session.traceId } },
      { status: 500 },
    );
  } finally {
    client.release();
  }
});