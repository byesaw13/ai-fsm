/**
 * GET /api/v1/vehicles/:id/overview — vehicle cost/ops summary for UI (TASK-093).
 */
import { NextRequest, NextResponse } from "next/server";
import {
  computeRenewalDueStatus,
  computeServiceNextDue,
  latestMpg,
  mpgByClosedAt,
  rollingMpg,
  type FuelLogForMpg,
  type ServiceRecordForDue,
  type ServiceScheduleForDue,
} from "@ai-fsm/domain";
import { withRole } from "@/lib/auth/middleware";
import { withDbSession } from "@/lib/db";
import { logger } from "@/lib/logger";
import { lastKnownOdometer } from "@/lib/vehicles/capture";

export const dynamic = "force-dynamic";

function vehicleIdFromPath(pathname: string): string {
  const m = pathname.match(/\/vehicles\/([^/]+)/);
  return m?.[1] ?? "";
}

export const GET = withRole(["owner", "admin", "tech"], async (req: NextRequest, session) => {
  const vehicleId = vehicleIdFromPath(req.nextUrl.pathname);
  const today = new Date().toISOString().slice(0, 10);

  try {
    const data = await withDbSession(session, async (client) => {
      const { rows: vehicleRows } = await client.query<{
        id: string;
        nickname: string;
        make: string | null;
        model: string | null;
        year: number | null;
        plate: string | null;
        kind: string;
        vin: string | null;
        is_active: boolean;
        purchase_date: string | null;
        purchase_price_cents: number | null;
      }>(
        `SELECT id, nickname, make, model, year, plate, kind, vin, is_active,
                purchase_date::text, purchase_price_cents
         FROM vehicles
         WHERE id = $1 AND account_id = $2 AND is_active = true`,
        [vehicleId, session.accountId],
      );
      const vehicle = vehicleRows[0];
      if (!vehicle) return null;

      const currentOdometer = await lastKnownOdometer(client, session.accountId, vehicleId);

      const { rows: scheduleRows } = await client.query<{
        service_type: string;
        interval_miles: number | null;
        interval_months: number | null;
        is_active: boolean;
      }>(
        `SELECT service_type, interval_miles, interval_months, is_active
         FROM vehicle_service_schedules
         WHERE account_id = $1 AND vehicle_id = $2 AND is_active = true`,
        [session.accountId, vehicleId],
      );

      const { rows: serviceRecordRows } = await client.query<{
        serviced_at: string;
        odometer: number | null;
        odometer_suspect: boolean;
        service_types: string[];
      }>(
        `SELECT serviced_at::text, odometer, odometer_suspect, service_types
         FROM vehicle_service_records
         WHERE account_id = $1 AND vehicle_id = $2
         ORDER BY serviced_at DESC
         LIMIT 50`,
        [session.accountId, vehicleId],
      );

      const records: ServiceRecordForDue[] = serviceRecordRows.map((r) => ({
        servicedAt: r.serviced_at,
        odometer: r.odometer,
        odometerSuspect: r.odometer_suspect,
        serviceTypes: r.service_types ?? [],
      }));

      const nextServiceDues = scheduleRows.map((s) => {
        const schedule: ServiceScheduleForDue = {
          serviceType: s.service_type,
          intervalMiles: s.interval_miles,
          intervalMonths: s.interval_months,
          isActive: s.is_active,
        };
        return computeServiceNextDue({
          schedule,
          records,
          currentOdometer,
          today,
        });
      });

      const { rows: renewalRows } = await client.query<{
        id: string;
        renewal_type: string;
        provider: string | null;
        interval_months: number;
        current_due_date: string;
        is_active: boolean;
      }>(
        `SELECT id, renewal_type, provider, interval_months, current_due_date::text, is_active
         FROM vehicle_renewals
         WHERE account_id = $1 AND vehicle_id = $2 AND is_active = true
         ORDER BY current_due_date ASC`,
        [session.accountId, vehicleId],
      );

      const nextRenewals = renewalRows.map((r) => {
        const due = computeRenewalDueStatus({
          renewal: {
            renewalType: r.renewal_type,
            currentDueDate: r.current_due_date,
            isActive: r.is_active,
          },
          today,
        });
        return {
          id: r.id,
          renewal_type: r.renewal_type,
          provider: r.provider,
          interval_months: r.interval_months,
          current_due_date: r.current_due_date,
          days_remaining: due.daysRemaining,
          status: due.status,
        };
      });

      const { rows: fuelRows } = await client.query<{
        id: string;
        filled_at: string;
        odometer: number | null;
        gallons: string;
        is_full_tank: boolean;
        odometer_suspect: boolean;
        notes: string | null;
        expense_id: string | null;
        vendor_name: string | null;
        amount_cents: number | null;
        has_receipt: boolean;
      }>(
        `SELECT f.id, f.filled_at::text, f.odometer, f.gallons::text, f.is_full_tank,
                f.odometer_suspect, f.notes, f.expense_id,
                e.vendor_name, e.amount_cents, (e.receipt_url IS NOT NULL) AS has_receipt
         FROM vehicle_fuel_logs f
         LEFT JOIN expenses e ON e.id = f.expense_id
         WHERE f.account_id = $1 AND f.vehicle_id = $2
         ORDER BY f.filled_at DESC
         LIMIT 50`,
        [session.accountId, vehicleId],
      );

      const fuelForMpg: FuelLogForMpg[] = fuelRows.map((r) => ({
        filledAt: r.filled_at,
        odometer: r.odometer,
        gallons: Number(r.gallons),
        isFullTank: r.is_full_tank,
        odometerSuspect: r.odometer_suspect,
      }));
      const mpgMap = mpgByClosedAt(fuelForMpg);
      const recentFuel = fuelRows.map((r) => {
        const gallons = Number(r.gallons);
        const amountCents = r.amount_cents;
        return {
          id: r.id,
          filled_at: r.filled_at,
          odometer: r.odometer,
          gallons,
          is_full_tank: r.is_full_tank,
          odometer_suspect: r.odometer_suspect,
          notes: r.notes,
          expense_id: r.expense_id,
          vendor_name: r.vendor_name,
          amount_cents: amountCents,
          has_receipt: r.has_receipt,
          dollars_per_gallon:
            amountCents != null && gallons > 0
              ? Math.round((amountCents / 100 / gallons) * 1000) / 1000
              : null,
          mpg: mpgMap.get(r.filled_at) ?? null,
        };
      });
      const lastFill = recentFuel[0] ?? null;

      const { rows: recentService } = await client.query(
        `SELECT id, serviced_at::text, odometer, odometer_suspect, service_types,
                vendor_name, notes, expense_id, created_at::text
         FROM vehicle_service_records
         WHERE account_id = $1 AND vehicle_id = $2
         ORDER BY serviced_at DESC
         LIMIT 5`,
        [session.accountId, vehicleId],
      );

      const { rows: costRows } = await client.query<{
        category: string;
        total_cents: string;
        expense_count: string;
      }>(
        `SELECT category,
                COALESCE(SUM(amount_cents), 0)::text AS total_cents,
                COUNT(*)::text AS expense_count
         FROM expenses
         WHERE account_id = $1 AND vehicle_id = $2
           AND expense_date >= ($3::date - interval '90 days')
         GROUP BY category
         ORDER BY category`,
        [session.accountId, vehicleId, today],
      );

      const costLast90Days = {
        by_category: costRows.map((c) => ({
          category: c.category,
          total_cents: Number(c.total_cents),
          expense_count: Number(c.expense_count),
        })),
        total_cents: costRows.reduce((sum, c) => sum + Number(c.total_cents), 0),
      };

      const { rows: loanRows } = await client.query(
        `SELECT id, lender, original_principal_cents, apr::text, monthly_payment_cents,
                start_date::text, term_months, current_balance_cents, is_active
         FROM vehicle_loans
         WHERE account_id = $1 AND vehicle_id = $2 AND is_active = true
         ORDER BY start_date DESC
         LIMIT 1`,
        [session.accountId, vehicleId],
      );

      return {
        vehicle: {
          ...vehicle,
          current_odometer: currentOdometer,
        },
        next_service_dues: nextServiceDues,
        next_renewals: nextRenewals,
        recent_fuel: recentFuel,
        last_fill: lastFill,
        mpg: {
          last: latestMpg(fuelForMpg),
          last_five: rollingMpg(fuelForMpg, 5),
        },
        recent_service: recentService,
        cost_last_90_days: costLast90Days,
        loan: loanRows[0] ?? null,
      };
    });

    if (!data) {
      return NextResponse.json({ error: { message: "Vehicle not found" } }, { status: 404 });
    }
    return NextResponse.json({ data });
  } catch (err) {
    logger.error("GET /api/v1/vehicles/:id/overview", err as Error, {
      traceId: session.traceId,
    });
    return NextResponse.json({ error: { message: "Failed to load overview" } }, { status: 500 });
  }
});
