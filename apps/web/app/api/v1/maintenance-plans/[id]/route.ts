import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { queryOne, getPool } from "@/lib/db";
import { getPathId } from "@/lib/route-utils";

export const dynamic = "force-dynamic";

const patchBody = z.object({
  name: z.string().min(1).max(255).optional(),
  membership_tier: z.enum(["essential", "plus", "premier"]).optional(),
  frequency: z.enum(["monthly", "quarterly", "biannual", "annual"]).optional(),
  services: z.array(z.string()).optional(),
  price_cents: z.number().int().min(0).optional(),
  annual_visit_count: z.number().int().positive().optional(),
  included_labor_minutes_per_visit: z.number().int().min(0).optional(),
  billing_cadence: z.enum(["annual", "monthly"]).optional(),
  annual_price_cents: z.number().int().min(0).optional(),
  status: z.enum(["active", "paused", "cancelled"]).optional(),
  next_scheduled_date: z.string().nullable().optional(),
  renewal_date: z.string().nullable().optional(),
  routing_zone: z.enum(["core", "extended", "out_of_area"]).optional(),
  notes: z.string().nullable().optional(),
  membership_terms: z.string().nullable().optional(),
  member_priority: z.enum(["standard", "priority", "vip"]).optional(),
  addon_ids: z.array(z.string().uuid()).optional(),
});

export const GET = withRole(["owner", "admin"], async (request: NextRequest, session: AuthSession) => {
  const id = getPathId(request.nextUrl.pathname);
  const plan = await queryOne(
    `SELECT mp.*, c.name AS client_name, p.address AS property_address
     FROM maintenance_plans mp
     JOIN clients c ON c.id = mp.client_id
     LEFT JOIN properties p ON p.id = mp.property_id
     WHERE mp.id = $1 AND mp.account_id = $2`,
    [id, session.accountId]
  );
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(plan);
});

export const PATCH = withRole(["owner", "admin"], async (request: NextRequest, session: AuthSession) => {
  const id = getPathId(request.nextUrl.pathname);
  const existing = await queryOne<{ id: string } & Record<string, unknown>>(
    `SELECT id FROM maintenance_plans WHERE id = $1 AND account_id = $2`,
    [id, session.accountId]
  );
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = patchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors } }, { status: 422 });
  }

  const { addon_ids, ...planFields } = parsed.data;
  const sets: string[] = ["updated_at = now()"];
  const values: unknown[] = [];
  let idx = 1;

  for (const [key, val] of Object.entries(planFields)) {
    if (val !== undefined) {
      sets.push(`${key} = $${idx++}`);
      values.push(val);
    }
  }
  values.push(id, session.accountId);

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query(
      `UPDATE maintenance_plans SET ${sets.join(", ")} WHERE id = $${idx++} AND account_id = $${idx} RETURNING *`,
      values
    );

    if (addon_ids !== undefined) {
      // Remove all current add-ons then re-insert the desired set
      await client.query(
        `DELETE FROM subscription_addons WHERE subscription_id = $1 AND account_id = $2`,
        [id, session.accountId]
      );
      if (addon_ids.length > 0) {
        const addonRows = await client.query(
          `SELECT id, annual_price_cents FROM plan_addons WHERE id = ANY($1) AND account_id = $2`,
          [addon_ids, session.accountId]
        );
        for (const addon of addonRows.rows) {
          await client.query(
            `INSERT INTO subscription_addons (account_id, subscription_id, addon_id, annual_price_cents)
             VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
            [session.accountId, id, addon.id, addon.annual_price_cents]
          );
        }
      }
    }

    await client.query("COMMIT");
    return NextResponse.json(result.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

export const DELETE = withRole(["owner"], async (request: NextRequest, session: AuthSession) => {
  const id = getPathId(request.nextUrl.pathname);
  const pool = getPool();
  const result = await pool.query(
    `DELETE FROM maintenance_plans WHERE id = $1 AND account_id = $2 RETURNING id`,
    [id, session.accountId]
  );
  if (result.rowCount === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
});
