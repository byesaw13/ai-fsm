/**
 * GET /api/v1/vehicles/:id/cost-summary — monthly costs + per-mile (TASK-093).
 */
import { NextRequest, NextResponse } from "next/server";
import { withRole } from "@/lib/auth/middleware";
import { withDbSession } from "@/lib/db";
import { logger } from "@/lib/logger";
import { aggregateVehicleCost } from "@/lib/vehicles/cost-summary";
import { assertVehicleInAccount } from "@/lib/vehicles/capture";

export const dynamic = "force-dynamic";

function vehicleIdFromPath(pathname: string): string {
  const m = pathname.match(/\/vehicles\/([^/]+)/);
  return m?.[1] ?? "";
}

function isDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export const GET = withRole(["owner", "admin", "tech"], async (req: NextRequest, session) => {
  const vehicleId = vehicleIdFromPath(req.nextUrl.pathname);
  const { searchParams } = req.nextUrl;
  const year = new Date().getUTCFullYear();
  const fromRaw = (searchParams.get("from") ?? `${year}-01-01`).trim();
  const toRaw = (searchParams.get("to") ?? `${year}-12-31`).trim();
  const from = isDate(fromRaw) ? fromRaw : `${year}-01-01`;
  const to = isDate(toRaw) ? toRaw : `${year}-12-31`;

  try {
    const data = await withDbSession(session, async (client) => {
      const vehicle = await assertVehicleInAccount(client, session.accountId, vehicleId);
      if (!vehicle) return null;

      const { rows } = await client.query<{
        period_month: string;
        category: string;
        total_cents: string;
        expense_count: string;
      }>(
        `SELECT period_month::text, category, total_cents::text, expense_count::text
         FROM vehicle_cost_summary
         WHERE account_id = $1 AND vehicle_id = $2
           AND period_month >= $3::date AND period_month <= $4::date
         ORDER BY period_month ASC, category ASC`,
        [session.accountId, vehicleId, from, to],
      );

      const months = rows.map((r) => ({
        period_month: r.period_month.slice(0, 10),
        category: r.category,
        total_cents: Number(r.total_cents),
        expense_count: Number(r.expense_count),
      }));

      const { rows: mileRows } = await client.query<{ miles: string }>(
        `SELECT COALESCE(SUM(COALESCE(miles, end_odometer - start_odometer)), 0)::text AS miles
         FROM vehicle_sessions
         WHERE account_id = $1 AND vehicle_id = $2
           AND session_date >= $3::date AND session_date <= $4::date
           AND (miles IS NOT NULL OR (end_odometer IS NOT NULL AND start_odometer IS NOT NULL))`,
        [session.accountId, vehicleId, from, to],
      );
      const miles = Number(mileRows[0]?.miles ?? 0);

      const totals = aggregateVehicleCost(
        months.map((m) => ({
          category: m.category,
          total_cents: m.total_cents,
          expense_count: m.expense_count,
        })),
        miles > 0 ? miles : null,
      );

      return {
        vehicle_id: vehicleId,
        from,
        to,
        months,
        miles,
        totals: {
          total_cents: totals.totalCents,
          cost_per_mile_cents: totals.costPerMileCents,
          by_category: totals.byCategory,
          expense_count: totals.expenseCount,
        },
      };
    });

    if (!data) {
      return NextResponse.json({ error: { message: "Vehicle not found" } }, { status: 404 });
    }
    return NextResponse.json({ data });
  } catch (err) {
    logger.error("GET /api/v1/vehicles/:id/cost-summary", err as Error, {
      traceId: session.traceId,
    });
    return NextResponse.json({ error: { message: "Failed to load cost summary" } }, { status: 500 });
  }
});
