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
  membership_tier: z.enum(["essential", "plus", "premier"]).default("plus"),
  frequency: z.enum(["monthly", "quarterly", "biannual", "annual"]),
  services: z.array(z.string()).default([]),
  price_cents: z.number().int().min(0),
  annual_visit_count: z.number().int().positive().default(2),
  included_labor_minutes_per_visit: z.number().int().min(0).default(60),
  billing_cadence: z.enum(["annual", "monthly"]).default("annual"),
  annual_price_cents: z.number().int().min(0).default(0),
  status: z.enum(["active", "paused", "cancelled"]).default("active"),
  next_scheduled_date: z.string().optional().nullable(),
  renewal_date: z.string().optional().nullable(),
  routing_zone: z.enum(["core", "extended", "out_of_area"]).default("core"),
  notes: z.string().optional().nullable(),
  membership_terms: z.string().optional().nullable(),
  member_priority: z.enum(["standard", "priority", "vip"]).default("standard"),
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

  const {
    client_id,
    property_id,
    name,
    membership_tier,
    frequency,
    services,
    price_cents,
    annual_visit_count,
    included_labor_minutes_per_visit,
    billing_cadence,
    annual_price_cents,
    status,
    next_scheduled_date,
    renewal_date,
    routing_zone,
    notes,
    membership_terms,
    member_priority,
  } = parsed.data;

  const pool = getPool();
  const result = await pool.query(
    `INSERT INTO maintenance_plans
       (account_id, client_id, property_id, name, membership_tier, frequency,
        services, price_cents, annual_visit_count, included_labor_minutes_per_visit,
        billing_cadence, annual_price_cents, status, next_scheduled_date,
        renewal_date, routing_zone, notes, membership_terms, member_priority, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
     RETURNING *`,
    [
      session.accountId,
      client_id,
      property_id ?? null,
      name,
      membership_tier,
      frequency,
      services,
      price_cents,
      annual_visit_count,
      included_labor_minutes_per_visit,
      billing_cadence,
      annual_price_cents,
      status,
      next_scheduled_date ?? null,
      renewal_date ?? null,
      routing_zone,
      notes ?? null,
      membership_terms ?? null,
      member_priority,
      session.userId,
    ]
  );

  return NextResponse.json(result.rows[0], { status: 201 });
});
