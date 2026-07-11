import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@/lib/logger";
import { loadTravelSettings, rowToTravelSettings } from "@/lib/travel/settings";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  origin_address: z.string().min(1).max(500).optional(),
  origin_city: z.string().min(1).max(100).optional(),
  origin_state: z.string().min(1).max(50).optional(),
  origin_zip: z.string().min(1).max(20).optional(),
  origin_latitude: z.number().nullable().optional(),
  origin_longitude: z.number().nullable().optional(),
  included_one_way_miles: z.number().min(0).max(500).optional(),
  mileage_only_cutoff_miles: z.number().min(0).max(500).optional(),
  travel_time_cutoff_miles: z.number().min(0).max(500).optional(),
  long_distance_review_miles: z.number().min(0).max(1000).optional(),
  minimum_project_value_low_cents: z.number().int().min(0).optional(),
  minimum_project_value_high_cents: z.number().int().min(0).optional(),
  default_mileage_rate_cents: z.number().int().min(0).optional(),
  default_travel_time_rate_cents: z.number().int().min(0).optional(),
  travel_time_rate_mode: z.enum(["standard_labor", "custom", "none"]).optional(),
  travel_time_rounding: z.enum(["exact", "nearest_15", "nearest_30"]).optional(),
  default_trip_calculation_method: z
    .enum(["once_for_project", "once_per_visit", "once_per_workday", "custom"])
    .optional(),
  default_trip_direction: z.enum(["round_trip", "one_way"]).optional(),
  customer_facing_line_title: z.string().min(1).max(200).optional(),
  customer_facing_description: z.string().min(1).max(2000).optional(),
  show_formulas_to_customer: z.boolean().optional(),
  high_travel_ratio_threshold: z.number().min(0).max(1).optional(),
});

export const GET = withRole(["owner", "admin"], async (_req: NextRequest, session: AuthSession) => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true),
              set_config('app.current_account_id', $2, true),
              set_config('app.current_role', $3, true)`,
      [session.userId, session.accountId, session.role]
    );
    const settings = await loadTravelSettings(client, session.accountId);
    return NextResponse.json({ data: settings });
  } catch (error) {
    logger.error("GET /api/v1/travel/settings", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to load travel settings", traceId: session.traceId } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});

export const PATCH = withRole(["owner", "admin"], async (request: NextRequest, session: AuthSession) => {
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid travel settings",
          details: parsed.error.flatten().fieldErrors,
          traceId: session.traceId,
        },
      },
      { status: 422 }
    );
  }

  const data = parsed.data;
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true),
              set_config('app.current_account_id', $2, true),
              set_config('app.current_role', $3, true)`,
      [session.userId, session.accountId, session.role]
    );

    // Ensure row exists
    await loadTravelSettings(client, session.accountId);

    const fields: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    const map: Array<[keyof typeof data, string]> = [
      ["origin_address", "origin_address"],
      ["origin_city", "origin_city"],
      ["origin_state", "origin_state"],
      ["origin_zip", "origin_zip"],
      ["origin_latitude", "origin_latitude"],
      ["origin_longitude", "origin_longitude"],
      ["included_one_way_miles", "included_one_way_miles"],
      ["mileage_only_cutoff_miles", "mileage_only_cutoff_miles"],
      ["travel_time_cutoff_miles", "travel_time_cutoff_miles"],
      ["long_distance_review_miles", "long_distance_review_miles"],
      ["minimum_project_value_low_cents", "minimum_project_value_low_cents"],
      ["minimum_project_value_high_cents", "minimum_project_value_high_cents"],
      ["default_mileage_rate_cents", "default_mileage_rate_cents"],
      ["default_travel_time_rate_cents", "default_travel_time_rate_cents"],
      ["travel_time_rate_mode", "travel_time_rate_mode"],
      ["travel_time_rounding", "travel_time_rounding"],
      ["default_trip_calculation_method", "default_trip_calculation_method"],
      ["default_trip_direction", "default_trip_direction"],
      ["customer_facing_line_title", "customer_facing_line_title"],
      ["customer_facing_description", "customer_facing_description"],
      ["show_formulas_to_customer", "show_formulas_to_customer"],
      ["high_travel_ratio_threshold", "high_travel_ratio_threshold"],
    ];
    for (const [key, col] of map) {
      if (data[key] !== undefined) {
        fields.push(`${col} = $${i++}`);
        params.push(data[key]);
      }
    }
    if (fields.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "No fields to update", traceId: session.traceId } },
        { status: 422 }
      );
    }
    fields.push("updated_at = now()");
    params.push(session.accountId);

    const { rows } = await client.query(
      `UPDATE business_travel_settings SET ${fields.join(", ")}
       WHERE account_id = $${i}
       RETURNING *`,
      params
    );

    await appendAuditLog(client, {
      account_id: session.accountId,
      entity_type: "account",
      entity_id: session.accountId,
      action: "update",
      actor_id: session.userId,
      trace_id: session.traceId,
      new_value: { travel_settings: rows[0] as Record<string, unknown> },
    });

    await client.query("COMMIT");
    return NextResponse.json({ data: rowToTravelSettings(rows[0] as Record<string, unknown>) });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("PATCH /api/v1/travel/settings", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to update travel settings", traceId: session.traceId } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});
