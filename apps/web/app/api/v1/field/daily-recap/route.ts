import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import { queryForSession } from "@/lib/db";
import { businessToday } from "@/lib/operations/business-day";
import { interpretDailyRecap, DailyRecapError, type RecapCandidateTask } from "@/lib/field/daily-recap";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  job_id: z.string().uuid(),
  /** When set (my-work page), only tasks on this work order are candidates. */
  work_order_id: z.string().uuid().optional(),
  narration: z.string().min(1).max(4000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/**
 * POST /api/v1/field/daily-recap — interpret a day's narration into a reviewable
 * per-task time draft. Read-only: writes NOTHING. The owner reviews the draft
 * and confirms via .../commit.
 */
export const POST = withAuth(async (request: NextRequest, session) => {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid request", traceId: session.traceId } },
      { status: 400 },
    );
  }
  const { job_id, work_order_id, narration } = parsed.data;
  const date = parsed.data.date ?? businessToday();

  try {
    // Candidate tasks: open tasks on this job. Prefer a single work order when
    // the field page is scoped to one assignment (tech my-work).
    const tasks = work_order_id
      ? await queryForSession<RecapCandidateTask>(
          session,
          `SELECT t.id, t.label, wo.title AS work_order_title
             FROM work_order_tasks t
             JOIN work_orders wo ON wo.id = t.work_order_id
            WHERE t.account_id = $1 AND wo.job_id = $2 AND wo.id = $3
              AND t.completed = false
              AND wo.status NOT IN ('completed','cancelled','closed')
              AND (
                $4::text IN ('owner','admin')
                OR wo.assigned_user_id = $5
              )
            ORDER BY t.sort_order ASC`,
          [session.accountId, job_id, work_order_id, session.role, session.userId],
        )
      : await queryForSession<RecapCandidateTask>(
          session,
          `SELECT t.id, t.label, wo.title AS work_order_title
             FROM work_order_tasks t
             JOIN work_orders wo ON wo.id = t.work_order_id
            WHERE t.account_id = $1 AND wo.job_id = $2 AND t.completed = false
              AND wo.status NOT IN ('completed','cancelled','closed')
              AND (
                $3::text IN ('owner','admin')
                OR wo.assigned_user_id = $4
              )
            ORDER BY wo.created_at ASC, t.sort_order ASC`,
          [session.accountId, job_id, session.role, session.userId],
        );

    const draft = await interpretDailyRecap({
      narration,
      candidateTasks: tasks,
      clockedMinutes: null, // v1: the narration carries the day length
      date,
    });
    return NextResponse.json({ data: { date, draft } });
  } catch (error) {
    if (error instanceof DailyRecapError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message, traceId: session.traceId } },
        { status: error.httpStatus },
      );
    }
    logger.error("POST /api/v1/field/daily-recap error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Could not interpret the recap", traceId: session.traceId } },
      { status: 500 },
    );
  }
});
