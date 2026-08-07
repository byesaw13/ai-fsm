/**
 * GET /api/v1/reports/vehicle-tax-export?from=&to=
 * Owner/admin CSV of expenses attributed to vehicles (TASK-093).
 */
import { NextRequest, NextResponse } from "next/server";
import { withRole } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { query } from "@/lib/db";
import { logger } from "@/lib/logger";
import { formatVehicleTaxCsv } from "@/lib/vehicles/tax-export";

export const dynamic = "force-dynamic";

function isDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export const GET = withRole(["owner", "admin"], async (request: NextRequest, session: AuthSession) => {
  try {
    const { searchParams } = new URL(request.url);
    const year = new Date().getUTCFullYear();
    const fromRaw = (searchParams.get("from") ?? `${year}-01-01`).trim();
    const toRaw = (searchParams.get("to") ?? `${year}-12-31`).trim();
    const from = isDate(fromRaw) ? fromRaw : `${year}-01-01`;
    const to = isDate(toRaw) ? toRaw : `${year}-12-31`;

    const rows = await query<{
      vehicle_nickname: string;
      expense_date: string;
      vendor_name: string | null;
      category: string;
      amount_cents: number;
      notes: string | null;
    }>(
      `SELECT v.nickname AS vehicle_nickname,
              e.expense_date::text,
              e.vendor_name,
              e.category,
              e.amount_cents,
              e.notes
       FROM expenses e
       JOIN vehicles v ON v.id = e.vehicle_id AND v.account_id = e.account_id
       WHERE e.account_id = $1
         AND e.vehicle_id IS NOT NULL
         AND e.expense_date >= $2::date
         AND e.expense_date <= $3::date
       ORDER BY v.nickname ASC, e.expense_date ASC, e.created_at ASC`,
      [session.accountId, from, to],
    );

    const csv = formatVehicleTaxCsv(rows);
    const filename = `vehicle-tax-export-${from}-${to}.csv`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    logger.error("GET /api/v1/reports/vehicle-tax-export", err as Error, {
      traceId: session.traceId,
    });
    return NextResponse.json({ error: { message: "Failed to export vehicle tax CSV" } }, { status: 500 });
  }
});
