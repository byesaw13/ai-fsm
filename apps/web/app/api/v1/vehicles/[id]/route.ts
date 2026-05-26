import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  nickname:  z.string().min(1).max(80).optional(),
  make:      z.string().max(80).nullable().optional(),
  model:     z.string().max(80).nullable().optional(),
  year:      z.number().int().min(1900).max(2100).nullable().optional(),
  plate:     z.string().max(20).nullable().optional(),
  is_active: z.boolean().optional(),
});

type VehicleRow = {
  id: string;
  nickname: string;
  make: string | null;
  model: string | null;
  year: number | null;
  plate: string | null;
  is_active: boolean;
  created_at: string;
};

export const PATCH = withRole(["owner", "admin"], async (req: NextRequest, session) => {
  const pathId = req.nextUrl.pathname.split("/").at(-1);
  const body = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { message: "Invalid input" } }, { status: 400 });
  }

  const fields: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  const d = parsed.data;
  if (d.nickname  !== undefined) { fields.push(`nickname = $${idx++}`);  params.push(d.nickname); }
  if (d.make      !== undefined) { fields.push(`make = $${idx++}`);      params.push(d.make); }
  if (d.model     !== undefined) { fields.push(`model = $${idx++}`);     params.push(d.model); }
  if (d.year      !== undefined) { fields.push(`year = $${idx++}`);      params.push(d.year); }
  if (d.plate     !== undefined) { fields.push(`plate = $${idx++}`);     params.push(d.plate); }
  if (d.is_active !== undefined) { fields.push(`is_active = $${idx++}`); params.push(d.is_active); }

  if (fields.length === 0) return NextResponse.json({ error: { message: "No fields to update" } }, { status: 400 });

  params.push(pathId, session.accountId);

  try {
    const row = await queryOne<VehicleRow>(
      `UPDATE vehicles SET ${fields.join(", ")}
       WHERE id = $${idx} AND account_id = $${idx + 1}
       RETURNING id, nickname, make, model, year, plate, is_active, created_at::text`,
      params
    );
    if (!row) return NextResponse.json({ error: { message: "Not found" } }, { status: 404 });
    return NextResponse.json({ data: row });
  } catch (err) {
    logger.error("PATCH /api/v1/vehicles/[id]", err as Error, { traceId: session.traceId });
    return NextResponse.json({ error: { message: "Failed to update vehicle" } }, { status: 500 });
  }
});
