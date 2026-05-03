import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { query, getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

const planBody = z.object({
  client_id: z.string().uuid(),
  property_id: z.string().uuid().optional().nullable(),
  name: z.string().min(1).max(255),
  frequency: z.enum(["monthly", "quarterly", "biannual", "annual"]),
  services: z.array(z.string()).default([]),
  price_cents: z.number().int().min(0),
  status: z.enum(["active", "paused", "cancelled"]).default("active"),
  next_scheduled_date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const GET = withRole(["owner", "admin"], async (_request: NextRequest, session: AuthSession) => {
  const plans = await query(
    `SELECT mp.*, c.name AS client_name, p.address AS property_address
     FROM maintenance_plans mp
     JOIN clients c ON c.id = mp.client_id
     LEFT JOIN properties p ON p.id = mp.property_id
     WHERE mp.account_id = $1
     ORDER BY mp.status, c.name`,
    [session.accountId]
  );
  return NextResponse.json(plans);
});

export const POST = withRole(["owner", "admin"], async (request: NextRequest, session: AuthSession) => {
  const body = await request.json().catch(() => null);
  const parsed = planBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors } }, { status: 422 });
  }

  const { client_id, property_id, name, frequency, services, price_cents, status, next_scheduled_date, notes } = parsed.data;

  const pool = getPool();
  const result = await pool.query(
    `INSERT INTO maintenance_plans
       (account_id, client_id, property_id, name, frequency, services, price_cents, status, next_scheduled_date, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [session.accountId, client_id, property_id ?? null, name, frequency, services, price_cents, status, next_scheduled_date ?? null, notes ?? null, session.userId]
  );

  return NextResponse.json(result.rows[0], { status: 201 });
});
