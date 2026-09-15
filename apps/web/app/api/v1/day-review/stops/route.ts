import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthSession } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import { logger } from "@/lib/logger";
import { STOP_REASONS, VISIT_CLOSEOUT_KINDS, CLOSEOUT_NEXT_WHEN } from "@ai-fsm/domain";
import {
  applyStopInterview,
  StopInterviewError,
} from "@/lib/day-review/apply-stop-interview";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  segment_id: z.string().uuid(),
  reason: z.enum(STOP_REASONS),
  notes: z.string().max(5000).optional(),
  job_title: z.string().max(255).optional(),
  closeout_kind: z.enum(VISIT_CLOSEOUT_KINDS).optional(),
  next_when: z.enum(CLOSEOUT_NEXT_WHEN).optional(),
  next_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  first_up: z.string().max(300).optional(),
  expense_ids: z.array(z.string().uuid()).optional(),
  expense_job_id: z.string().uuid().optional(),
});

export const POST = withAuth(async (request: NextRequest, session: AuthSession) => {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request",
          details: parsed.error.flatten().fieldErrors,
          traceId: session.traceId,
        },
      },
      { status: 400 },
    );
  }
  const d = parsed.data;
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true),
              set_config('app.current_account_id', $2, true),
              set_config('app.current_role', $3, true)`,
      [session.userId, session.accountId, session.role],
    );
    const result = await applyStopInterview(client, session, {
      segmentId: d.segment_id,
      reason: d.reason,
      notes: d.notes,
      jobTitle: d.job_title,
      closeoutKind: d.closeout_kind,
      nextWhen: d.next_when,
      nextDate: d.next_date,
      firstUp: d.first_up,
      expenseIds: d.expense_ids,
      expenseJobId: d.expense_job_id,
    });
    await client.query("COMMIT");
    return NextResponse.json({ data: result });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err instanceof StopInterviewError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message, traceId: session.traceId } },
        { status: err.httpStatus },
      );
    }
    logger.error("POST /api/v1/day-review/stops", err, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Could not save stop", traceId: session.traceId } },
      { status: 500 },
    );
  } finally {
    client.release();
  }
});
