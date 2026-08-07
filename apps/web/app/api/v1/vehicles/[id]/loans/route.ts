/**
 * GET/POST /api/v1/vehicles/:id/loans — loan reference facts (TASK-093).
 * Payments are expenses (worker or manual); this table is schedule/reference only.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import { withDbSession } from "@/lib/db";
import { logger } from "@/lib/logger";
import { assertVehicleInAccount } from "@/lib/vehicles/capture";

export const dynamic = "force-dynamic";

function vehicleIdFromPath(pathname: string): string {
  const m = pathname.match(/\/vehicles\/([^/]+)/);
  return m?.[1] ?? "";
}

const postSchema = z.object({
  lender: z.string().min(1).max(120),
  original_principal_cents: z.number().int().min(0),
  monthly_payment_cents: z.number().int().min(0),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  apr: z.number().min(0).max(100).nullable().optional(),
  term_months: z.number().int().positive().nullable().optional(),
  current_balance_cents: z.number().int().min(0).nullable().optional(),
});

type LoanRow = {
  id: string;
  lender: string;
  original_principal_cents: number;
  apr: string | null;
  monthly_payment_cents: number;
  start_date: string;
  term_months: number | null;
  current_balance_cents: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export const GET = withRole(["owner", "admin", "tech"], async (req: NextRequest, session) => {
  const vehicleId = vehicleIdFromPath(req.nextUrl.pathname);
  try {
    const rows = await withDbSession(session, async (client) => {
      const vehicle = await assertVehicleInAccount(client, session.accountId, vehicleId);
      if (!vehicle) return null;
      const { rows: loans } = await client.query<LoanRow>(
        `SELECT id, lender, original_principal_cents, apr::text, monthly_payment_cents,
                start_date::text, term_months, current_balance_cents, is_active,
                created_at::text, updated_at::text
         FROM vehicle_loans
         WHERE account_id = $1 AND vehicle_id = $2
         ORDER BY is_active DESC, start_date DESC`,
        [session.accountId, vehicleId],
      );
      return loans;
    });
    if (rows === null) {
      return NextResponse.json({ error: { message: "Vehicle not found" } }, { status: 404 });
    }
    return NextResponse.json({ data: rows });
  } catch (err) {
    logger.error("GET /api/v1/vehicles/:id/loans", err as Error, {
      traceId: session.traceId,
    });
    return NextResponse.json({ error: { message: "Failed to list loans" } }, { status: 500 });
  }
});

export const POST = withRole(["owner", "admin"], async (req: NextRequest, session) => {
  const vehicleId = vehicleIdFromPath(req.nextUrl.pathname);
  const raw = await req.json().catch(() => ({}));
  const parsed = postSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: "Invalid input", details: parsed.error.issues } },
      { status: 400 },
    );
  }
  const d = parsed.data;
  try {
    const row = await withDbSession(session, async (client) => {
      const vehicle = await assertVehicleInAccount(client, session.accountId, vehicleId);
      if (!vehicle) throw new Error("VEHICLE_NOT_FOUND");

      const { rows } = await client.query<LoanRow>(
        `INSERT INTO vehicle_loans (
           account_id, vehicle_id, lender, original_principal_cents, apr,
           monthly_payment_cents, start_date, term_months, current_balance_cents
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, $9)
         RETURNING id, lender, original_principal_cents, apr::text, monthly_payment_cents,
                   start_date::text, term_months, current_balance_cents, is_active,
                   created_at::text, updated_at::text`,
        [
          session.accountId,
          vehicleId,
          d.lender,
          d.original_principal_cents,
          d.apr ?? null,
          d.monthly_payment_cents,
          d.start_date.slice(0, 10),
          d.term_months ?? null,
          d.current_balance_cents ?? null,
        ],
      );
      return rows[0];
    });
    return NextResponse.json({ data: row }, { status: 201 });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === "VEHICLE_NOT_FOUND") {
      return NextResponse.json({ error: { message: "Vehicle not found" } }, { status: 404 });
    }
    logger.error("POST /api/v1/vehicles/:id/loans", err as Error, {
      traceId: session.traceId,
    });
    return NextResponse.json({ error: { message: "Failed to create loan" } }, { status: 500 });
  }
});
