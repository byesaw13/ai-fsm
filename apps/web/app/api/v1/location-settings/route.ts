import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthSession } from "@/lib/auth/middleware";
import { queryForSession } from "@/lib/db";
import { canViewReports } from "@/lib/auth/permissions";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// EPIC-007 TASK-046: account-level location capture controls (owner/admin).
// Master enable/disable + a temporary pause. The ingest endpoint also requires
// an active Start-Day workday session before processing events.

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  // ISO timestamp to pause until, or null to resume now.
  paused_until: z.string().datetime().nullable().optional(),
});

export const PATCH = withAuth(async (request: NextRequest, session: AuthSession) => {
  if (!canViewReports(session.role)) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Not permitted", traceId: session.traceId } },
      { status: 403 },
    );
  }
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid request", traceId: session.traceId } },
      { status: 400 },
    );
  }
  const d = parsed.data;
  if (d.enabled === undefined && d.paused_until === undefined) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Nothing to update", traceId: session.traceId } },
      { status: 400 },
    );
  }
  try {
    const rows = await queryForSession<{
      location_tracking_enabled: boolean;
      location_paused_until: string | null;
    }>(
      session,
      `UPDATE accounts
       SET location_tracking_enabled = COALESCE($2, location_tracking_enabled),
           location_paused_until = CASE WHEN $3::boolean THEN $4::timestamptz ELSE location_paused_until END,
           updated_at = now()
       WHERE id = $1
       RETURNING location_tracking_enabled, location_paused_until::text`,
      [
        session.accountId,
        d.enabled ?? null,
        d.paused_until !== undefined, // whether to touch paused_until
        d.paused_until ?? null,
      ],
    );
    return NextResponse.json({ data: rows[0] });
  } catch (error) {
    logger.error("PATCH /api/v1/location-settings error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to update settings", traceId: session.traceId } },
      { status: 500 },
    );
  }
});
