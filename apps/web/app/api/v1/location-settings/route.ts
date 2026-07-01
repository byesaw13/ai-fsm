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
  // Day-review settings (migration 137)
  day_review_cutoff_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  min_stop_dwell_minutes: z.number().int().min(1).max(60).optional(),
  visit_confidence_threshold: z.number().int().min(0).max(100).optional(),
  suppress_weekend_start_prompt: z.boolean().optional(),
  close_day_followup_hours: z.number().int().min(1).max(24).nullable().optional(),
  tracking_start_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  tracking_end_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
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
  const hasUpdate = Object.values(d).some((v) => v !== undefined);
  if (!hasUpdate) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Nothing to update", traceId: session.traceId } },
      { status: 400 },
    );
  }
  try {
    const rows = await queryForSession<{
      location_tracking_enabled: boolean;
      location_paused_until: string | null;
      day_review_cutoff_time: string;
      min_stop_dwell_minutes: number;
      visit_confidence_threshold: number;
      suppress_weekend_start_prompt: boolean;
      close_day_followup_hours: number | null;
      tracking_start_time: string | null;
      tracking_end_time: string | null;
    }>(
      session,
      `UPDATE accounts
       SET location_tracking_enabled        = COALESCE($2, location_tracking_enabled),
           location_paused_until            = CASE WHEN $3::boolean THEN $4::timestamptz ELSE location_paused_until END,
           day_review_cutoff_time           = COALESCE($5::time, day_review_cutoff_time),
           min_stop_dwell_minutes           = COALESCE($6, min_stop_dwell_minutes),
           visit_confidence_threshold       = COALESCE($7, visit_confidence_threshold),
           suppress_weekend_start_prompt    = COALESCE($8, suppress_weekend_start_prompt),
           close_day_followup_hours         = CASE WHEN $9::boolean THEN $10 ELSE close_day_followup_hours END,
           tracking_start_time              = CASE WHEN $11::boolean THEN $12::time ELSE tracking_start_time END,
           tracking_end_time                = CASE WHEN $13::boolean THEN $14::time ELSE tracking_end_time END,
           updated_at = now()
       WHERE id = $1
       RETURNING location_tracking_enabled, location_paused_until::text,
                 day_review_cutoff_time::text, min_stop_dwell_minutes,
                 visit_confidence_threshold, suppress_weekend_start_prompt,
                 close_day_followup_hours,
                 tracking_start_time::text, tracking_end_time::text`,
      [
        session.accountId,
        d.enabled ?? null,
        d.paused_until !== undefined,
        d.paused_until ?? null,
        d.day_review_cutoff_time ?? null,
        d.min_stop_dwell_minutes ?? null,
        d.visit_confidence_threshold ?? null,
        d.suppress_weekend_start_prompt ?? null,
        d.close_day_followup_hours !== undefined,
        d.close_day_followup_hours ?? null,
        d.tracking_start_time !== undefined,
        d.tracking_start_time ?? null,
        d.tracking_end_time !== undefined,
        d.tracking_end_time ?? null,
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
