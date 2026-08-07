import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import { query, queryOne } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  nickname: z.string().min(1).max(80),
  make:     z.string().max(80).optional(),
  model:    z.string().max(80).optional(),
  year:     z.number().int().min(1900).max(2100).optional(),
  plate:    z.string().max(20).optional(),
  kind:     z.enum(["truck", "van", "trailer", "other"]).optional(),
});

type VehicleRow = {
  id: string;
  nickname: string;
  make: string | null;
  model: string | null;
  year: number | null;
  plate: string | null;
  kind: string;
  is_active: boolean;
  is_default: boolean;
  bluetooth_id: string | null;
  created_at: string;
  current_odometer: number | null;  // derived from most recent session end_odometer
  last_session_date: string | null;
  total_miles: string | null;        // lifetime miles rolled up across this vehicle's sessions
};

export const GET = withRole(["owner", "admin", "tech"], async (req: NextRequest, session) => {
  try {
    // mileage_only=1 excludes trailers (TASK-093) from drive/session pickers
    const mileageOnly = req.nextUrl.searchParams.get("mileage_only") === "1";
    const rows = await query<VehicleRow>(
      `SELECT v.id, v.nickname, v.make, v.model, v.year, v.plate, v.kind, v.is_active, v.is_default, v.bluetooth_id, v.created_at::text,
              last_s.end_odometer   AS current_odometer,
              last_s.session_date::text AS last_session_date,
              roll.total_miles::text AS total_miles
       FROM vehicles v
       LEFT JOIN LATERAL (
         SELECT end_odometer, session_date
         FROM vehicle_sessions
         WHERE vehicle_id = v.id AND account_id = v.account_id AND end_odometer IS NOT NULL
         ORDER BY session_date DESC, created_at DESC
         LIMIT 1
       ) last_s ON true
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(COALESCE(miles, end_odometer - start_odometer)), 0) AS total_miles
         FROM vehicle_sessions
         WHERE vehicle_id = v.id AND account_id = v.account_id
           AND (miles IS NOT NULL OR end_odometer IS NOT NULL)
       ) roll ON true
       WHERE v.account_id = $1
         ${mileageOnly ? "AND v.kind <> 'trailer'" : ""}
       ORDER BY v.is_active DESC, v.nickname ASC`,
      [session.accountId]
    );
    return NextResponse.json({ data: rows });
  } catch (err) {
    logger.error("GET /api/v1/vehicles", err as Error, { traceId: session.traceId });
    return NextResponse.json({ error: { message: "Failed to fetch vehicles" } }, { status: 500 });
  }
});

export const POST = withRole(["owner", "admin"], async (req: NextRequest, session) => {
  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { message: "Invalid input", details: parsed.error.issues } }, { status: 400 });
  }
  const { nickname, make, model, year, plate, kind } = parsed.data;
  try {
    const row = await queryOne<VehicleRow>(
      `INSERT INTO vehicles (account_id, nickname, make, model, year, plate, kind)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, nickname, make, model, year, plate, kind, is_active, created_at::text`,
      [
        session.accountId,
        nickname,
        make ?? null,
        model ?? null,
        year ?? null,
        plate ?? null,
        kind ?? "truck",
      ]
    );
    return NextResponse.json({ data: row }, { status: 201 });
  } catch (err) {
    logger.error("POST /api/v1/vehicles", err as Error, { traceId: session.traceId });
    return NextResponse.json({ error: { message: "Failed to create vehicle" } }, { status: 500 });
  }
});
