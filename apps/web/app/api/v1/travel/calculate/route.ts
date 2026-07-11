import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import { logger } from "@/lib/logger";
import { calculateTravelForAccount } from "@/lib/travel/calculate";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  property_id: z.string().uuid().nullable().optional(),
  destination_address: z.string().max(500).nullable().optional(),
  client_id: z.string().uuid().nullable().optional(),
  project_value_cents: z.number().int().min(0).nullable().optional(),
  trip_count: z.number().int().min(1).max(60).nullable().optional(),
  trip_direction: z.enum(["round_trip", "one_way"]).nullable().optional(),
  trip_calculation_method: z
    .enum(["once_for_project", "once_per_visit", "once_per_workday", "custom"])
    .nullable()
    .optional(),
  planned_visits: z.number().int().min(1).max(60).nullable().optional(),
  planned_workdays: z.number().int().min(1).max(60).nullable().optional(),
  charge_mode: z
    .enum(["include_in_labor", "separate_line", "waive", "custom"])
    .nullable()
    .optional(),
  custom_total_cents: z.number().int().min(0).nullable().optional(),
  manual_one_way_miles: z.number().min(0).max(2000).nullable().optional(),
  manual_one_way_minutes: z.number().int().min(0).max(24 * 60).nullable().optional(),
});

/**
 * POST /api/v1/travel/calculate
 * Preview travel charges without persisting. Owner sees full calculation.
 */
export const POST = withRole(["owner", "admin"], async (request: NextRequest, session: AuthSession) => {
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid calculate request",
          details: parsed.error.flatten().fieldErrors,
          traceId: session.traceId,
        },
      },
      { status: 422 }
    );
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true),
              set_config('app.current_account_id', $2, true),
              set_config('app.current_role', $3, true)`,
      [session.userId, session.accountId, session.role]
    );

    const result = await calculateTravelForAccount(client, session.accountId, parsed.data);
    return NextResponse.json({ data: result });
  } catch (error) {
    logger.error("POST /api/v1/travel/calculate", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Travel calculation failed", traceId: session.traceId } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});
