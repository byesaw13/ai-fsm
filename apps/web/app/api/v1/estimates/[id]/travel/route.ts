import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@/lib/logger";
import { calculateTravelForAccount } from "@/lib/travel/calculate";
import { applyTravelToEstimate, insertTravelSnapshot } from "@/lib/travel/snapshots";
import { loadTravelSettings } from "@/lib/travel/settings";

export const dynamic = "force-dynamic";

const applySchema = z.object({
  charge_mode: z.enum(["include_in_labor", "separate_line", "waive", "custom"]),
  custom_total_cents: z.number().int().min(0).nullable().optional(),
  trip_count: z.number().int().min(1).max(60).nullable().optional(),
  trip_direction: z.enum(["round_trip", "one_way"]).nullable().optional(),
  trip_calculation_method: z
    .enum(["once_for_project", "once_per_visit", "once_per_workday", "custom"])
    .nullable()
    .optional(),
  planned_visits: z.number().int().min(1).max(60).nullable().optional(),
  planned_workdays: z.number().int().min(1).max(60).nullable().optional(),
  manual_one_way_miles: z.number().min(0).max(2000).nullable().optional(),
  manual_one_way_minutes: z.number().int().min(0).max(24 * 60).nullable().optional(),
  override_reason: z.string().max(1000).nullable().optional(),
  /** When true, recalculate from map/manual; when false and snapshot exists, re-apply only. */
  recalculate: z.boolean().default(true),
});

function estimateIdFromPath(pathname: string): string {
  // /api/v1/estimates/{id}/travel
  const parts = pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("estimates");
  return parts[idx + 1];
}

/**
 * POST /api/v1/estimates/[id]/travel
 * Calculate (optional) and apply travel charge + snapshot to an estimate.
 * Blocked for approved estimates unless charge is only being re-saved with owner override.
 */
export const POST = withRole(["owner", "admin"], async (request: NextRequest, session: AuthSession) => {
  const estimateId = estimateIdFromPath(request.nextUrl.pathname);
  const body = await request.json().catch(() => null);
  const parsed = applySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid travel apply body",
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

    const est = await client.query<{
      id: string;
      status: string;
      client_id: string;
      property_id: string | null;
      job_id: string | null;
      total_cents: number;
      travel_snapshot_id: string | null;
    }>(
      `SELECT id, status, client_id, property_id, job_id, total_cents, travel_snapshot_id
       FROM estimates WHERE id = $1 AND account_id = $2`,
      [estimateId, session.accountId]
    );
    if (!est.rowCount) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Estimate not found", traceId: session.traceId } },
        { status: 404 }
      );
    }
    const estimate = est.rows[0];

    // Never silently change accepted totals
    if (estimate.status === "approved" || estimate.status === "accepted") {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          error: {
            code: "IMMUTABLE_ENTITY",
            message:
              "Cannot modify travel on an approved estimate without creating a revision. Convert to invoice or revise the estimate first.",
            traceId: session.traceId,
          },
        },
        { status: 409 }
      );
    }

    const calc = await calculateTravelForAccount(client, session.accountId, {
      property_id: estimate.property_id,
      client_id: estimate.client_id,
      project_value_cents: estimate.total_cents,
      trip_count: data.trip_count,
      trip_direction: data.trip_direction,
      trip_calculation_method: data.trip_calculation_method,
      planned_visits: data.planned_visits,
      planned_workdays: data.planned_workdays,
      charge_mode: data.charge_mode,
      custom_total_cents: data.custom_total_cents,
      manual_one_way_miles: data.manual_one_way_miles,
      manual_one_way_minutes: data.manual_one_way_minutes,
    });

    const overridden =
      data.charge_mode === "waive" ||
      data.charge_mode === "custom" ||
      data.manual_one_way_miles != null;

    if (overridden && !data.override_reason?.trim() && data.charge_mode !== "separate_line") {
      // Reason recommended for waive/custom — soft require for waive
      if (data.charge_mode === "waive" || data.charge_mode === "custom") {
        await client.query("ROLLBACK");
        return NextResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Override/waiver reason is required for waive or custom travel amounts.",
              traceId: session.traceId,
            },
          },
          { status: 422 }
        );
      }
    }

    const snapshot = await insertTravelSnapshot(client, {
      account_id: session.accountId,
      origin_address: calc.origin_address,
      destination_address: calc.destination_address,
      result: calc.calculation,
      calculation_source: calc.calculation_source,
      trip_calculation_method: calc.trip_calculation_method,
      mileage_rate_id: calc.mileage_rate_id,
      manually_overridden: overridden,
      override_reason: data.override_reason ?? null,
      estimate_id: estimateId,
      job_id: estimate.job_id,
      kind: "estimate",
      created_by: session.userId,
    });

    const settings = await loadTravelSettings(client, session.accountId);
    await applyTravelToEstimate(client, {
      accountId: session.accountId,
      estimateId,
      snapshot,
      settingsLineTitle: settings.customer_facing_line_title,
      settingsLineDescription: settings.customer_facing_description,
    });

    await appendAuditLog(client, {
      account_id: session.accountId,
      entity_type: "estimate",
      entity_id: estimateId,
      action: "update",
      actor_id: session.userId,
      trace_id: session.traceId,
      new_value: {
        travel_snapshot_id: snapshot.id,
        charge_mode: data.charge_mode,
        total_travel_charge_cents: snapshot.total_travel_charge_cents,
      },
    });

    await client.query("COMMIT");
    return NextResponse.json({
      data: {
        snapshot,
        calculation: calc.calculation,
        origin_address: calc.origin_address,
        destination_address: calc.destination_address,
        geocode_failed: calc.geocode_failed,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("POST /api/v1/estimates/[id]/travel", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to apply travel", traceId: session.traceId } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});

export const GET = withRole(["owner", "admin", "tech"], async (request: NextRequest, session: AuthSession) => {
  const estimateId = estimateIdFromPath(request.nextUrl.pathname);
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true),
              set_config('app.current_account_id', $2, true),
              set_config('app.current_role', $3, true)`,
      [session.userId, session.accountId, session.role]
    );
    const est = await client.query<{ travel_snapshot_id: string | null; travel_charge_mode: string | null }>(
      `SELECT travel_snapshot_id, travel_charge_mode FROM estimates WHERE id = $1 AND account_id = $2`,
      [estimateId, session.accountId]
    );
    if (!est.rowCount) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Estimate not found", traceId: session.traceId } },
        { status: 404 }
      );
    }
    if (!est.rows[0].travel_snapshot_id) {
      return NextResponse.json({ data: null });
    }
    const snap = await client.query(`SELECT * FROM travel_calculation_snapshots WHERE id = $1`, [
      est.rows[0].travel_snapshot_id,
    ]);
    return NextResponse.json({
      data: snap.rows[0] ?? null,
      charge_mode: est.rows[0].travel_charge_mode,
    });
  } finally {
    client.release();
  }
});
