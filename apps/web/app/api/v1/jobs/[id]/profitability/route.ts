import { NextRequest, NextResponse } from "next/server";
import { withRole } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  laborCostForMargin,
  trackedLaborMinutesFromActivityEntries,
} from "@/lib/invoices/tracked-labor";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/jobs/[id]/profitability
 *
 * Owner/admin only — internal cost data must never reach tech role.
 * Returns tracked hours, actual vs estimated labor cost, revenue, and gross margin.
 * Margin uses actual tracked job_work when present (all jobs, not only T&M).
 */
export const GET = withRole(["owner", "admin"], async (request: NextRequest, session) => {
  const id = request.url.match(/\/jobs\/([^/]+)\/profitability/)?.[1];

  if (!id) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Job not found", traceId: session.traceId } },
      { status: 404 }
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

    // Job fields + best approved estimate for cost basis
    const jobResult = await client.query<{
      id: string;
      title: string;
      status: string;
      parts_cost_cents: number | null;
      travel_miles: number | null;
      estimated_labor_cost_cents: number | null;
      estimated_total_cents: number | null;
      invoice_total_cents: number | null;
      invoice_paid_cents: number | null;
      invoice_status: string | null;
    }>(
      `SELECT
         j.id, j.title, j.status,
         j.actual_cost_cents           AS parts_cost_cents,
         j.travel_miles,
         e.internal_labor_cost_cents   AS estimated_labor_cost_cents,
         e.total_cents                 AS estimated_total_cents,
         i.total_cents                 AS invoice_total_cents,
         i.paid_cents                  AS invoice_paid_cents,
         i.status                      AS invoice_status
       FROM jobs j
       LEFT JOIN LATERAL (
         SELECT total_cents, internal_labor_cost_cents
         FROM estimates
         WHERE job_id = j.id AND account_id = j.account_id AND status = 'approved'
         ORDER BY created_at DESC
         LIMIT 1
       ) e ON true
       LEFT JOIN LATERAL (
         SELECT total_cents, paid_cents, status
         FROM invoices
         WHERE job_id = j.id AND account_id = j.account_id AND status != 'void'
         ORDER BY created_at DESC
         LIMIT 1
       ) i ON true
       WHERE j.id = $1 AND j.account_id = $2`,
      [id, session.accountId]
    );

    if (jobResult.rowCount === 0) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Job not found", traceId: session.traceId } },
        { status: 404 }
      );
    }

    const row = jobResult.rows[0];
    const trackedMinutes = await trackedLaborMinutesFromActivityEntries(
      client,
      session.accountId,
      id,
    );
    const labor = laborCostForMargin({
      trackedMinutes,
      estimatedLaborCostCents: row.estimated_labor_cost_cents,
    });

    const revenue_cents = row.invoice_total_cents ?? row.estimated_total_cents ?? null;
    const parts_cost_cents = row.parts_cost_cents ?? 0;
    const labor_cost_cents = labor.laborCostCents;
    const cost_cents =
      labor_cost_cents !== null || parts_cost_cents > 0
        ? (labor_cost_cents ?? 0) + parts_cost_cents
        : null;
    const gross_margin_cents =
      revenue_cents !== null && cost_cents !== null ? revenue_cents - cost_cents : null;
    const gross_margin_pct =
      revenue_cents !== null && gross_margin_cents !== null && revenue_cents > 0
        ? Math.round((gross_margin_cents / revenue_cents) * 1000) / 10
        : null;

    return NextResponse.json({
      data: {
        job_id: row.id,
        job_title: row.title,
        job_status: row.status,
        // Time + cost breakdown
        tracked_labor_minutes: Math.round(trackedMinutes),
        tracked_labor_hours: labor.trackedHours,
        actual_labor_cost_cents: labor.actualLaborCostCents,
        estimated_labor_cost_cents: row.estimated_labor_cost_cents,
        labor_cost_source: labor.source,
        parts_cost_cents,
        travel_miles: row.travel_miles,
        // Revenue
        estimated_total_cents: row.estimated_total_cents,
        invoice_total_cents: row.invoice_total_cents,
        invoice_paid_cents: row.invoice_paid_cents,
        invoice_status: row.invoice_status,
        // Margin (actual labor when tracked, else estimate + parts vs revenue)
        revenue_cents,
        labor_cost_cents,
        cost_cents,
        gross_margin_cents,
        gross_margin_pct,
      },
    });
  } catch (error) {
    logger.error("GET /api/v1/jobs/[id]/profitability error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch profitability", traceId: session.traceId } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});
