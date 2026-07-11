import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@/lib/logger";
import { calculateTravelForAccount } from "@/lib/travel/calculate";
import { insertTravelSnapshot } from "@/lib/travel/snapshots";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  charge_mode: z
    .enum(["include_in_labor", "separate_line", "waive", "custom"])
    .default("separate_line"),
  custom_total_cents: z.number().int().min(0).nullable().optional(),
  trip_count: z.number().int().min(1).max(60).nullable().optional(),
  trip_direction: z.enum(["round_trip", "one_way"]).nullable().optional(),
  manual_one_way_miles: z.number().min(0).max(2000).nullable().optional(),
  manual_one_way_minutes: z.number().int().min(0).max(24 * 60).nullable().optional(),
  override_reason: z.string().max(1000).nullable().optional(),
  property_id: z.string().uuid().nullable().optional(),
  client_id: z.string().uuid().nullable().optional(),
});

function workOrderIdFromPath(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("work-orders");
  return parts[idx + 1];
}

/**
 * POST /api/v1/work-orders/[id]/travel
 * Calculate and attach a travel snapshot to a work order (planning context).
 * Does not bill — billing happens on estimate/invoice.
 */
export const POST = withRole(["owner", "admin"], async (request: NextRequest, session: AuthSession) => {
  const workOrderId = workOrderIdFromPath(request.nextUrl.pathname);
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid travel body",
          details: parsed.error.flatten().fieldErrors,
          traceId: session.traceId,
        },
      },
      { status: 422 }
    );
  }
  const data = parsed.data;

  if (
    (data.charge_mode === "waive" || data.charge_mode === "custom") &&
    !data.override_reason?.trim()
  ) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Override reason required for waive or custom travel",
          traceId: session.traceId,
        },
      },
      { status: 422 }
    );
  }

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

    const wo = await client.query<{
      id: string;
      client_id: string;
      property_id: string | null;
      job_id: string | null;
    }>(
      `SELECT id, client_id, property_id, job_id
       FROM work_orders WHERE id = $1 AND account_id = $2`,
      [workOrderId, session.accountId]
    );
    if (!wo.rowCount) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Work order not found", traceId: session.traceId } },
        { status: 404 }
      );
    }
    const row = wo.rows[0];
    const propertyId = data.property_id ?? row.property_id;
    const clientId = data.client_id ?? row.client_id;

    if (!propertyId) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Work order has no property — assign a property to calculate travel",
            traceId: session.traceId,
          },
        },
        { status: 422 }
      );
    }

    const calc = await calculateTravelForAccount(client, session.accountId, {
      property_id: propertyId,
      client_id: clientId,
      charge_mode: data.charge_mode,
      custom_total_cents: data.custom_total_cents,
      trip_count: data.trip_count,
      trip_direction: data.trip_direction,
      manual_one_way_miles: data.manual_one_way_miles,
      manual_one_way_minutes: data.manual_one_way_minutes,
    });

    const snapshot = await insertTravelSnapshot(client, {
      account_id: session.accountId,
      origin_address: calc.origin_address,
      destination_address: calc.destination_address,
      result: calc.calculation,
      calculation_source: calc.calculation_source,
      trip_calculation_method: calc.trip_calculation_method,
      mileage_rate_id: calc.mileage_rate_id,
      manually_overridden:
        data.charge_mode === "waive" ||
        data.charge_mode === "custom" ||
        data.manual_one_way_miles != null,
      override_reason: data.override_reason ?? null,
      work_order_id: workOrderId,
      job_id: row.job_id,
      kind: "estimate",
      created_by: session.userId,
    });

    await client.query(
      `UPDATE work_orders
       SET travel_snapshot_id = $1, updated_at = now()
       WHERE id = $2 AND account_id = $3`,
      [snapshot.id, workOrderId, session.accountId]
    );

    await appendAuditLog(client, {
      account_id: session.accountId,
      entity_type: "work_order",
      entity_id: workOrderId,
      action: "update",
      actor_id: session.userId,
      trace_id: session.traceId,
      new_value: {
        travel_snapshot_id: snapshot.id,
        total_travel_charge_cents: snapshot.total_travel_charge_cents,
        policy_tier: snapshot.policy_tier,
      },
    });

    await client.query("COMMIT");
    return NextResponse.json({ data: { snapshot, calculation: calc.calculation } });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("POST /api/v1/work-orders/[id]/travel", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to attach travel", traceId: session.traceId } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});

export const GET = withRole(["owner", "admin", "tech"], async (request: NextRequest, session: AuthSession) => {
  const workOrderId = workOrderIdFromPath(request.nextUrl.pathname);
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true),
              set_config('app.current_account_id', $2, true),
              set_config('app.current_role', $3, true)`,
      [session.userId, session.accountId, session.role]
    );
    const wo = await client.query<{ travel_snapshot_id: string | null }>(
      `SELECT travel_snapshot_id FROM work_orders WHERE id = $1 AND account_id = $2`,
      [workOrderId, session.accountId]
    );
    if (!wo.rowCount) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Work order not found", traceId: session.traceId } },
        { status: 404 }
      );
    }
    if (!wo.rows[0].travel_snapshot_id) {
      return NextResponse.json({ data: null });
    }
    const snap = await client.query(`SELECT * FROM travel_calculation_snapshots WHERE id = $1`, [
      wo.rows[0].travel_snapshot_id,
    ]);
    return NextResponse.json({ data: snap.rows[0] ?? null });
  } finally {
    client.release();
  }
});
