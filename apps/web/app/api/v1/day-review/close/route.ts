import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import { withDbSession } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getBusinessDayById, setBusinessDayStatus } from "@/lib/operations/business-day";
import { checkBusinessDayTransition } from "@ai-fsm/domain";
import type { BusinessDayStatus } from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

const schema = z.object({ id: z.string().uuid() });

export const POST = withAuth(async (request: NextRequest, session) => {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "id required", traceId: session.traceId } },
      { status: 400 },
    );
  }
  const { id } = parsed.data;
  try {
    const result = await withDbSession(session, async (client) => {
      const day = await getBusinessDayById(client, session.accountId, id, { lockForUpdate: true });
      if (!day) return { kind: "not_found" as const };
      if (day.status === "CLOSED") return { kind: "ok" as const, closedAt: day.closed_at };

      // Transition to READY_TO_CLOSE first if not already there
      let currentStatus = day.status as BusinessDayStatus;
      if (currentStatus !== "READY_TO_CLOSE") {
        const check = checkBusinessDayTransition(currentStatus, "READY_TO_CLOSE", {});
        if (!check.ok) return { kind: "invalid" as const, reason: check.reason ?? "Cannot close from current state" };
        const mid = await setBusinessDayStatus(client, session.accountId, id, currentStatus, "READY_TO_CLOSE", null);
        if (!mid) return { kind: "conflict" as const };
        currentStatus = "READY_TO_CLOSE";
      }

      const updated = await setBusinessDayStatus(client, session.accountId, id, currentStatus, "CLOSED", null);
      if (!updated) return { kind: "conflict" as const };
      return { kind: "ok" as const, closedAt: updated.closed_at };
    });

    if (result.kind === "not_found") {
      return NextResponse.json({ error: { code: "NOT_FOUND", traceId: session.traceId } }, { status: 404 });
    }
    if (result.kind === "invalid") {
      return NextResponse.json(
        { error: { code: "INVALID_TRANSITION", message: result.reason, traceId: session.traceId } },
        { status: 409 },
      );
    }
    if (result.kind === "conflict") {
      return NextResponse.json(
        { error: { code: "CONFLICT", message: "Business day changed — reload and retry.", traceId: session.traceId } },
        { status: 409 },
      );
    }
    return NextResponse.json({ data: { closedAt: result.closedAt } });
  } catch (err) {
    logger.error("POST /api/v1/day-review/close", err, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to close day", traceId: session.traceId } },
      { status: 500 },
    );
  }
});
