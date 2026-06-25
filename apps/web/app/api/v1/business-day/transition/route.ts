/**
 * POST /api/v1/business-day/transition — move a business day's lifecycle status.
 *
 * Body: { id, to, reason? }. Only explicit day transitions move the day; closing
 * a trip/activity/job never does. Validated by the domain state machine
 * (`checkBusinessDayTransition`): CLOSED only via READY_TO_CLOSE, reopen needs a
 * reason. See docs/canonical/OPERATIONS.md.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import { withDbSession } from "@/lib/db";
import { logger } from "@/lib/logger";
import { BUSINESS_DAY_STATUSES, checkBusinessDayTransition } from "@ai-fsm/domain";
import { getBusinessDayById, setBusinessDayStatus } from "@/lib/operations/business-day";

export const dynamic = "force-dynamic";

const schema = z.object({
  id: z.string().uuid(),
  to: z.enum(BUSINESS_DAY_STATUSES),
  reason: z.string().max(500).nullable().optional(),
});

export const POST = withAuth(async (request: NextRequest, session) => {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid transition", details: parsed.error.flatten().fieldErrors, traceId: session.traceId } },
      { status: 400 },
    );
  }
  const { id, to, reason } = parsed.data;

  try {
    const result = await withDbSession(session, async (client) => {
      const day = await getBusinessDayById(client, session.accountId, id);
      if (!day) return { kind: "not_found" as const };
      const check = checkBusinessDayTransition(day.status, to, { reason: reason ?? undefined });
      if (!check.ok) return { kind: "invalid" as const, reason: check.reason ?? "Invalid transition" };
      const updated = await setBusinessDayStatus(client, session.accountId, id, to, reason ?? null);
      return { kind: "ok" as const, updated };
    });

    if (result.kind === "not_found") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Business day not found", traceId: session.traceId } },
        { status: 404 },
      );
    }
    if (result.kind === "invalid") {
      return NextResponse.json(
        { error: { code: "INVALID_TRANSITION", message: result.reason, traceId: session.traceId } },
        { status: 409 },
      );
    }
    return NextResponse.json({ data: result.updated });
  } catch (error) {
    logger.error("POST /api/v1/business-day/transition error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to transition business day", traceId: session.traceId } },
      { status: 500 },
    );
  }
});
