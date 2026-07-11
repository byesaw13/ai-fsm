import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@/lib/logger";
import { calculateTravelForAccount } from "@/lib/travel/calculate";
import { applyTravelToInvoice, getTravelSnapshot, insertTravelSnapshot } from "@/lib/travel/snapshots";
import { loadTravelSettings } from "@/lib/travel/settings";
import { compareTravelSnapshots } from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

const applySchema = z.object({
  billing_mode: z.enum(["estimated", "actual", "none", "custom"]),
  custom_total_cents: z.number().int().min(0).nullable().optional(),
  /** Recalculate actual from map / logs. Default false — prefer carried estimate. */
  recalculate: z.boolean().default(false),
  trip_count: z.number().int().min(1).max(60).nullable().optional(),
  trip_direction: z.enum(["round_trip", "one_way"]).nullable().optional(),
  manual_one_way_miles: z.number().min(0).max(2000).nullable().optional(),
  manual_one_way_minutes: z.number().int().min(0).max(24 * 60).nullable().optional(),
  override_reason: z.string().max(1000).nullable().optional(),
  /** Required when actual exceeds estimated. */
  owner_review_approved: z.boolean().optional(),
});

function invoiceIdFromPath(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("invoices");
  return parts[idx + 1];
}

/**
 * POST /api/v1/invoices/[id]/travel
 * Apply estimated / actual / custom / none travel to a draft invoice.
 * Does not silently alter approved customer prices on non-draft invoices.
 */
export const POST = withRole(["owner", "admin"], async (request: NextRequest, session: AuthSession) => {
  const invoiceId = invoiceIdFromPath(request.nextUrl.pathname);
  const body = await request.json().catch(() => null);
  const parsed = applySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid invoice travel body",
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

    const inv = await client.query<{
      id: string;
      status: string;
      client_id: string;
      property_id: string | null;
      job_id: string | null;
      estimate_id: string | null;
      travel_snapshot_id: string | null;
      total_cents: number;
    }>(
      `SELECT id, status, client_id, property_id, job_id, estimate_id, travel_snapshot_id, total_cents
       FROM invoices WHERE id = $1 AND account_id = $2`,
      [invoiceId, session.accountId]
    );
    if (!inv.rowCount) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Invoice not found", traceId: session.traceId } },
        { status: 404 }
      );
    }
    const invoice = inv.rows[0];
    if (invoice.status !== "draft") {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          error: {
            code: "IMMUTABLE_ENTITY",
            message: "Only draft invoices may change travel charges.",
            traceId: session.traceId,
          },
        },
        { status: 409 }
      );
    }

    const settings = await loadTravelSettings(client, session.accountId);

    // Load estimate snapshot if any (carried forward)
    let estimateSnapshot = null as Awaited<ReturnType<typeof getTravelSnapshot>>;
    if (invoice.estimate_id) {
      const est = await client.query<{ travel_snapshot_id: string | null }>(
        `SELECT travel_snapshot_id FROM estimates WHERE id = $1 AND account_id = $2`,
        [invoice.estimate_id, session.accountId]
      );
      if (est.rows[0]?.travel_snapshot_id) {
        estimateSnapshot = await getTravelSnapshot(client, est.rows[0].travel_snapshot_id);
      }
    }
    if (!estimateSnapshot && invoice.travel_snapshot_id) {
      estimateSnapshot = await getTravelSnapshot(client, invoice.travel_snapshot_id);
    }

    let chargeCents = 0;
    let snapshot;

    if (data.billing_mode === "none") {
      chargeCents = 0;
      // Keep a zero snapshot for audit trail
      const zeroCalc = await calculateTravelForAccount(client, session.accountId, {
        property_id: invoice.property_id,
        client_id: invoice.client_id,
        charge_mode: "waive",
        manual_one_way_miles: 0,
        manual_one_way_minutes: 0,
      });
      snapshot = await insertTravelSnapshot(client, {
        account_id: session.accountId,
        origin_address: zeroCalc.origin_address,
        destination_address: zeroCalc.destination_address,
        result: { ...zeroCalc.calculation, total_travel_charge_cents: 0, charge_mode: "waive" },
        calculation_source: "carried_forward",
        trip_calculation_method: zeroCalc.trip_calculation_method,
        estimate_id: invoice.estimate_id,
        invoice_id: invoiceId,
        job_id: invoice.job_id,
        kind: "invoice",
        parent_snapshot_id: estimateSnapshot?.id ?? null,
        override_reason: data.override_reason ?? "No additional travel",
        created_by: session.userId,
      });
    } else if (data.billing_mode === "estimated" && estimateSnapshot && !data.recalculate) {
      chargeCents = estimateSnapshot.total_travel_charge_cents;
      snapshot = await insertTravelSnapshot(client, {
        account_id: session.accountId,
        origin_address: estimateSnapshot.origin_address,
        destination_address: estimateSnapshot.destination_address,
        result: {
          one_way_miles: estimateSnapshot.one_way_miles,
          round_trip_miles: estimateSnapshot.round_trip_miles,
          one_way_minutes: estimateSnapshot.one_way_minutes,
          round_trip_minutes: estimateSnapshot.round_trip_minutes,
          trip_count: estimateSnapshot.trip_count,
          trip_direction: estimateSnapshot.trip_direction,
          total_miles: estimateSnapshot.total_miles,
          total_minutes: estimateSnapshot.total_minutes,
          included_miles: estimateSnapshot.included_miles,
          billable_miles: estimateSnapshot.billable_miles,
          mileage_rate_cents: estimateSnapshot.mileage_rate_cents,
          mileage_charge_cents: estimateSnapshot.mileage_charge_cents,
          billable_travel_minutes: estimateSnapshot.billable_travel_minutes,
          travel_time_rate_cents: estimateSnapshot.travel_time_rate_cents,
          travel_time_charge_cents: estimateSnapshot.travel_time_charge_cents,
          recommended_total_cents: estimateSnapshot.recommended_total_cents,
          total_travel_charge_cents: estimateSnapshot.total_travel_charge_cents,
          policy_tier: estimateSnapshot.policy_tier as "local",
          policy_tier_label: estimateSnapshot.policy_tier,
          charge_mode: estimateSnapshot.charge_mode,
          client_rule: (estimateSnapshot.client_rule as "standard_policy") ?? "standard_policy",
          relationship_type: (estimateSnapshot.relationship_type as "standard") ?? "standard",
          warnings: [],
          owner_review_required: estimateSnapshot.owner_review_required,
          waived_mileage: false,
          waived_travel_time: false,
          waived_all: false,
        },
        calculation_source: "carried_forward",
        trip_calculation_method: estimateSnapshot.trip_calculation_method,
        mileage_rate_id: estimateSnapshot.mileage_rate_id,
        estimate_id: invoice.estimate_id,
        invoice_id: invoiceId,
        job_id: invoice.job_id,
        kind: "invoice",
        parent_snapshot_id: estimateSnapshot.id,
        created_by: session.userId,
      });
    } else if (data.billing_mode === "custom") {
      if (data.custom_total_cents == null) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "custom_total_cents required for custom billing mode",
              traceId: session.traceId,
            },
          },
          { status: 422 }
        );
      }
      if (!data.override_reason?.trim()) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Override reason required for custom travel amount",
              traceId: session.traceId,
            },
          },
          { status: 422 }
        );
      }
      const calc = await calculateTravelForAccount(client, session.accountId, {
        property_id: invoice.property_id,
        client_id: invoice.client_id,
        charge_mode: "custom",
        custom_total_cents: data.custom_total_cents,
        trip_count: data.trip_count,
        trip_direction: data.trip_direction,
        manual_one_way_miles: data.manual_one_way_miles,
        manual_one_way_minutes: data.manual_one_way_minutes,
      });
      chargeCents = data.custom_total_cents;
      snapshot = await insertTravelSnapshot(client, {
        account_id: session.accountId,
        origin_address: calc.origin_address,
        destination_address: calc.destination_address,
        result: calc.calculation,
        calculation_source: calc.calculation_source,
        trip_calculation_method: calc.trip_calculation_method,
        mileage_rate_id: calc.mileage_rate_id,
        manually_overridden: true,
        override_reason: data.override_reason,
        estimate_id: invoice.estimate_id,
        invoice_id: invoiceId,
        job_id: invoice.job_id,
        kind: "invoice",
        parent_snapshot_id: estimateSnapshot?.id ?? null,
        created_by: session.userId,
      });
    } else {
      // actual or recalculate estimated
      // Prefer mileage logs on job when present
      let manualMiles = data.manual_one_way_miles;
      let manualMinutes = data.manual_one_way_minutes;
      let source: "map_provider" | "haversine_estimate" | "manual" | "mileage_log" | "carried_forward" =
        "map_provider";

      if (invoice.job_id && data.billing_mode === "actual" && manualMiles == null) {
        // Prefer vehicle_sessions (source of truth for odometer/mileage capture).
        // Sessions may link as entity_type='job' OR entity_type='visit' (sessions UI).
        // Dedupe by session id so a session tagged with both job + visit is counted once.
        // Fall back to mileage_logs (job_id or visit→job) when no session miles exist.
        const sessions = await client.query<{ total_miles: string }>(
          `SELECT COALESCE(SUM(session_miles), 0)::text AS total_miles
           FROM (
             SELECT DISTINCT ON (s.id)
                    s.id,
                    COALESCE(s.miles, (s.end_odometer - s.start_odometer)::numeric) AS session_miles
             FROM vehicle_sessions s
             JOIN vehicle_session_activities a ON a.session_id = s.id
             LEFT JOIN visits v
               ON v.id = a.entity_id
              AND a.entity_type = 'visit'
              AND v.account_id = s.account_id
             WHERE s.account_id = $1
               AND s.status IS DISTINCT FROM 'voided'
               AND (
                 (a.entity_type = 'job' AND a.entity_id = $2)
                 OR (a.entity_type = 'visit' AND v.job_id = $2)
               )
               AND (
                 s.miles IS NOT NULL
                 OR (s.start_odometer IS NOT NULL AND s.end_odometer IS NOT NULL)
               )
             ORDER BY s.id
           ) deduped`,
          [session.accountId, invoice.job_id]
        );
        let total = Number(sessions.rows[0]?.total_miles ?? 0);

        if (total <= 0) {
          const logs = await client.query<{ total_miles: string }>(
            `SELECT COALESCE(SUM(ml.miles), 0)::text AS total_miles
             FROM mileage_logs ml
             LEFT JOIN visits v
               ON v.id = ml.visit_id
              AND v.account_id = ml.account_id
             WHERE ml.account_id = $1
               AND (ml.trip_type IS NULL OR ml.trip_type IN ('job', 'mixed'))
               AND (
                 ml.job_id = $2
                 OR v.job_id = $2
               )`,
            [session.accountId, invoice.job_id]
          );
          total = Number(logs.rows[0]?.total_miles ?? 0);
        }

        if (total > 0) {
          // session/log miles are typically full-trip totals; convert to one-way for engine
          manualMiles = total / 2;
          source = "mileage_log";
        }
      }

      const calc = await calculateTravelForAccount(client, session.accountId, {
        property_id: invoice.property_id,
        client_id: invoice.client_id,
        project_value_cents: invoice.total_cents,
        charge_mode: "separate_line",
        trip_count: data.trip_count ?? estimateSnapshot?.trip_count ?? 1,
        trip_direction: data.trip_direction ?? estimateSnapshot?.trip_direction ?? "round_trip",
        manual_one_way_miles: manualMiles,
        manual_one_way_minutes: manualMinutes,
      });

      chargeCents = calc.calculation.total_travel_charge_cents;

      if (estimateSnapshot && data.billing_mode === "actual") {
        const diff = compareTravelSnapshots({
          estimated_total_cents: estimateSnapshot.total_travel_charge_cents,
          actual_total_cents: chargeCents,
        });
        if (diff.requires_owner_review && !data.owner_review_approved) {
          await client.query("ROLLBACK");
          return NextResponse.json(
            {
              error: {
                code: "OWNER_REVIEW_REQUIRED",
                message:
                  "Actual travel exceeds the estimate. Approve the difference before adding it to the invoice.",
                details: {
                  estimated_cents: estimateSnapshot.total_travel_charge_cents,
                  actual_cents: chargeCents,
                  difference_cents: diff.difference_cents,
                },
                traceId: session.traceId,
              },
            },
            { status: 409 }
          );
        }
      }

      snapshot = await insertTravelSnapshot(client, {
        account_id: session.accountId,
        origin_address: calc.origin_address,
        destination_address: calc.destination_address,
        result: calc.calculation,
        calculation_source: source === "mileage_log" ? "mileage_log" : calc.calculation_source,
        trip_calculation_method: calc.trip_calculation_method,
        mileage_rate_id: calc.mileage_rate_id,
        manually_overridden: manualMiles != null,
        override_reason: data.override_reason ?? null,
        owner_review_approved: data.owner_review_approved ?? false,
        estimate_id: invoice.estimate_id,
        invoice_id: invoiceId,
        job_id: invoice.job_id,
        kind: data.billing_mode === "actual" ? "actual" : "invoice",
        parent_snapshot_id: estimateSnapshot?.id ?? null,
        created_by: session.userId,
      });
    }

    await applyTravelToInvoice(client, {
      accountId: session.accountId,
      invoiceId,
      snapshot,
      settingsLineTitle: settings.customer_facing_line_title,
      settingsLineDescription: settings.customer_facing_description,
      billingMode: data.billing_mode,
    });

    await appendAuditLog(client, {
      account_id: session.accountId,
      entity_type: "invoice",
      entity_id: invoiceId,
      action: "update",
      actor_id: session.userId,
      trace_id: session.traceId,
      new_value: {
        travel_snapshot_id: snapshot.id,
        billing_mode: data.billing_mode,
        total_travel_charge_cents: chargeCents,
      },
    });

    await client.query("COMMIT");
    return NextResponse.json({
      data: {
        snapshot,
        estimated_snapshot: estimateSnapshot,
        comparison:
          estimateSnapshot != null
            ? compareTravelSnapshots({
                estimated_total_cents: estimateSnapshot.total_travel_charge_cents,
                actual_total_cents: snapshot.total_travel_charge_cents,
              })
            : null,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("POST /api/v1/invoices/[id]/travel", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to apply invoice travel", traceId: session.traceId } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});

export const GET = withRole(["owner", "admin", "tech"], async (request: NextRequest, session: AuthSession) => {
  const invoiceId = invoiceIdFromPath(request.nextUrl.pathname);
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true),
              set_config('app.current_account_id', $2, true),
              set_config('app.current_role', $3, true)`,
      [session.userId, session.accountId, session.role]
    );
    const inv = await client.query<{
      travel_snapshot_id: string | null;
      travel_billing_mode: string | null;
      estimate_id: string | null;
    }>(
      `SELECT travel_snapshot_id, travel_billing_mode, estimate_id
       FROM invoices WHERE id = $1 AND account_id = $2`,
      [invoiceId, session.accountId]
    );
    if (!inv.rowCount) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Invoice not found", traceId: session.traceId } },
        { status: 404 }
      );
    }
    let current = null;
    if (inv.rows[0].travel_snapshot_id) {
      current = await getTravelSnapshot(client, inv.rows[0].travel_snapshot_id);
    }
    let estimated = null;
    if (inv.rows[0].estimate_id) {
      const est = await client.query<{ travel_snapshot_id: string | null }>(
        `SELECT travel_snapshot_id FROM estimates WHERE id = $1`,
        [inv.rows[0].estimate_id]
      );
      if (est.rows[0]?.travel_snapshot_id) {
        estimated = await getTravelSnapshot(client, est.rows[0].travel_snapshot_id);
      }
    }
    return NextResponse.json({
      data: {
        current,
        estimated,
        billing_mode: inv.rows[0].travel_billing_mode,
        comparison:
          current && estimated
            ? compareTravelSnapshots({
                estimated_total_cents: estimated.total_travel_charge_cents,
                actual_total_cents: current.total_travel_charge_cents,
              })
            : null,
      },
    });
  } finally {
    client.release();
  }
});
