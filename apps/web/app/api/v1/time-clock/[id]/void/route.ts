/**
 * POST /api/v1/time-clock/[id]/void — void a clock session (never delete).
 * Records a reason and an audit-log entry. RLS scopes to the account and (for
 * techs) to their own rows.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import { withDbSession } from "@/lib/db";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@/lib/logger";
import { voidClock } from "@/lib/operations/time-clock";

export const dynamic = "force-dynamic";

const schema = z.object({ reason: z.string().trim().min(1).max(500) });

/** id is the segment before the /void action. */
function clockIdFromPath(pathname: string): string {
  return pathname.split("/").at(-2) ?? "";
}

export const POST = withAuth(async (request: NextRequest, session) => {
  const id = clockIdFromPath(request.nextUrl.pathname);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "A reason is required.", traceId: session.traceId } },
      { status: 400 },
    );
  }
  try {
    const voided = await withDbSession(session, async (client) => {
      const row = await voidClock(client, session.accountId, id, parsed.data.reason);
      if (row) {
        await appendAuditLog(client, {
          account_id: session.accountId,
          entity_type: "time_clock_session",
          entity_id: id,
          action: "update",
          actor_id: session.userId,
          trace_id: session.traceId,
          new_value: { op: "void", correction_reason: parsed.data.reason },
        });
      }
      return row;
    });
    if (!voided) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Clock session not found or already voided.", traceId: session.traceId } },
        { status: 404 },
      );
    }
    return NextResponse.json({ data: voided });
  } catch (error) {
    logger.error("POST /api/v1/time-clock/[id]/void error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to void the clock session", traceId: session.traceId } },
      { status: 500 },
    );
  }
});
