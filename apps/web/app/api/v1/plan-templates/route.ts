import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { query, getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

const templateBody = z.object({
  name: z.string().min(1).max(255),
  tier: z.enum(["essential", "plus", "premier"]),
  description: z.string().nullable().optional(),
  visit_count_per_year: z.number().int().positive(),
  included_labor_minutes_per_visit: z.number().int().min(0),
  base_price_cents: z.number().int().min(0),
  included_features: z.array(z.string()).default([]),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
});

export const GET = withRole(["owner", "admin"], async (_req: NextRequest, session: AuthSession) => {
  const rows = await query(
    `SELECT t.*,
            COUNT(mp.id) FILTER (WHERE mp.status = 'active') AS active_subscription_count
     FROM plan_templates t
     LEFT JOIN maintenance_plans mp ON mp.plan_template_id = t.id AND mp.account_id = t.account_id
     WHERE t.account_id = $1
     GROUP BY t.id
     ORDER BY t.sort_order, t.name`,
    [session.accountId]
  );
  return NextResponse.json({ data: rows });
});

export const POST = withRole(["owner", "admin"], async (req: NextRequest, session: AuthSession) => {
  const body = await req.json().catch(() => null);
  const parsed = templateBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors } },
      { status: 422 }
    );
  }

  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO plan_templates
       (account_id, name, tier, description, visit_count_per_year,
        included_labor_minutes_per_visit, base_price_cents, included_features,
        is_active, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      session.accountId,
      parsed.data.name,
      parsed.data.tier,
      parsed.data.description ?? null,
      parsed.data.visit_count_per_year,
      parsed.data.included_labor_minutes_per_visit,
      parsed.data.base_price_cents,
      parsed.data.included_features,
      parsed.data.is_active,
      parsed.data.sort_order,
    ]
  );
  return NextResponse.json({ data: rows[0] }, { status: 201 });
});
