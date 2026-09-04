/**
 * POST /api/v1/time-clock/[id]/correct — correct a clock session by voiding it
 * and re-adding a corrected one (never delete). Body: clock_in_at, optional
 * clock_out_at (omit/null to leave open), reason. Writes an audit-log entry.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import { withDbSession } from "@/lib/db";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@/lib/logger";
import { validateClockCorrection } from "@ai-fsm/domain";
import { correctClock } from "@/lib/operations/time-clock";

export const dynamic = "force-dynamic";

const schema = z.object({
  clock_in_at: z.string().min(1),
  clock_out_at: z.string().min(1).nullable().optional(),
  reason: z.string().trim().min(1).max(500),
});

/** id is the segment before the /correct action. */
function clockIdFromPath(pathname: string): string {
  return pathname.split("/").at(-2) ?? "";
}

export const POST = withAuth(async (request: NextRequest, session) => {
  const id = clockIdFromPath(request.nextUrl.pathname);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid correction", details: parsed.error.flatten().fieldErrors, traceId: session.traceId } },
      { status: 400 },
    );
  }
  // Business-rule validation shared with the UI (reason, ordering, no future).
  const valid = validateClockCorrection({
    clockInAt: parsed.data.clock_in_at,
    clockOutAt: parsed.data.clock_out_at ?? null,
    reason: parsed.data.reason,
  });
  if (!valid.ok) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: valid.error, traceId: session.traceId } },
      { status: 400 },
    );
  }
  try {
    const corrected = await withDbSession(session, async (client) => {
      const row = await correctClock(client, session.accountId, id, session.userId, {
        clockInAt: valid.clockInAt,
        clockOutAt: valid.clockOutAt,
        reason: parsed.data.reason,
      });
      if (row) {
        await appendAuditLog(client, {
          account_id: session.accountId,
          entity_type: "time_clock_session",
          entity_id: id,
          action: "update",
          actor_id: session.userId,
          trace_id: session.traceId,
          new_value: { op: "correct", replaced_by: row.id, clock_in_at: valid.clockInAt, clock_out_at: valid.clockOutAt, correction_reason: parsed.data.reason },
        });
      }
      return row;
    });
    if (!corrected) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Clock session not found or already voided.", traceId: session.traceId } },
        { status: 404 },
      );
    }
    return NextResponse.json({ data: corrected }, { status: 201 });
  } catch (error) {
    logger.error("POST /api/v1/time-clock/[id]/correct error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to correct the clock session", traceId: session.traceId } },
      { status: 500 },
    );
  }
});
