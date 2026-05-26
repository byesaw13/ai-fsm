import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const ENTITY_TYPES = ["job", "visit", "estimate", "supplier_run", "other"] as const;

const addActivitySchema = z.object({
  entity_type: z.enum(ENTITY_TYPES),
  entity_id:   z.string().uuid().nullable().optional(),
  label:       z.string().max(200).nullable().optional(),
});

export const POST = withAuth(async (request: NextRequest, session: AuthSession) => {
  const sessionId = request.nextUrl.pathname.split("/").at(-2);

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: { message: "Invalid JSON" } }, { status: 400 });
  }

  const parsed = addActivitySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { message: "Invalid input", details: parsed.error.flatten().fieldErrors } }, { status: 400 });
  }

  try {
    // Verify session belongs to this account
    const owns = await queryOne<{ id: string }>(
      `SELECT id FROM vehicle_sessions WHERE id = $1 AND account_id = $2`,
      [sessionId, session.accountId]
    );
    if (!owns) return NextResponse.json({ error: { message: "Not found" } }, { status: 404 });

    const row = await queryOne<{ id: string }>(
      `INSERT INTO vehicle_session_activities (session_id, entity_type, entity_id, label)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [sessionId, parsed.data.entity_type, parsed.data.entity_id ?? null, parsed.data.label ?? null]
    );
    return NextResponse.json({ data: row }, { status: 201 });
  } catch (error) {
    logger.error("POST /api/v1/sessions/[id]/activities error", error, { traceId: session.traceId });
    return NextResponse.json({ error: { message: "Failed to add activity" } }, { status: 500 });
  }
});

export const DELETE = withAuth(async (request: NextRequest, session: AuthSession) => {
  const parts = request.nextUrl.pathname.split("/");
  const sessionId = parts.at(-2);
  const activityId = request.nextUrl.searchParams.get("activity_id");

  if (!activityId) return NextResponse.json({ error: { message: "activity_id required" } }, { status: 400 });

  try {
    const result = await queryOne<{ id: string }>(
      `DELETE FROM vehicle_session_activities a
       USING vehicle_sessions s
       WHERE a.id = $1 AND a.session_id = s.id AND s.id = $2 AND s.account_id = $3
       RETURNING a.id`,
      [activityId, sessionId, session.accountId]
    );
    if (!result) return NextResponse.json({ error: { message: "Not found" } }, { status: 404 });
    return NextResponse.json({ data: { id: result.id } });
  } catch (error) {
    logger.error("DELETE /api/v1/sessions/[id]/activities error", error, { traceId: session.traceId });
    return NextResponse.json({ error: { message: "Failed to remove activity" } }, { status: 500 });
  }
});
