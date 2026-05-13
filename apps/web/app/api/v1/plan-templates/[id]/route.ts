import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { queryOne, getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

const patchBody = z.object({
  name: z.string().min(1).max(255).optional(),
  tier: z.enum(["essential", "plus", "premier"]).optional(),
  description: z.string().nullable().optional(),
  visit_count_per_year: z.number().int().positive().optional(),
  included_labor_minutes_per_visit: z.number().int().min(0).optional(),
  base_price_cents: z.number().int().min(0).optional(),
  included_features: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

function getId(url: string) {
  return url.match(/\/plan-templates\/([^/]+)/)?.[1] ?? null;
}

export const GET = withRole(["owner", "admin"], async (req: NextRequest, session: AuthSession) => {
  const id = getId(req.url);
  if (!id) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const row = await queryOne(
    `SELECT t.*,
            COUNT(mp.id) FILTER (WHERE mp.status = 'active') AS active_subscription_count
     FROM plan_templates t
     LEFT JOIN maintenance_plans mp ON mp.plan_template_id = t.id AND mp.account_id = t.account_id
     WHERE t.id = $1 AND t.account_id = $2
     GROUP BY t.id`,
    [id, session.accountId]
  );
  if (!row) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  return NextResponse.json({ data: row });
});

export const PATCH = withRole(["owner", "admin"], async (req: NextRequest, session: AuthSession) => {
  const id = getId(req.url);
  if (!id) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = patchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors } },
      { status: 422 }
    );
  }

  const pool = getPool();
  const fields: string[] = [];
  const values: unknown[] = [id, session.accountId];
  let idx = 3;
  for (const [key, val] of Object.entries(parsed.data)) {
    if (val !== undefined) {
      fields.push(`${key} = $${idx++}`);
      values.push(val);
    }
  }
  if (fields.length === 0) {
    const existing = await queryOne(`SELECT * FROM plan_templates WHERE id = $1 AND account_id = $2`, [id, session.accountId]);
    if (!existing) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
    return NextResponse.json({ data: existing });
  }

  const { rows } = await pool.query(
    `UPDATE plan_templates SET ${fields.join(", ")}, updated_at = now()
     WHERE id = $1 AND account_id = $2 RETURNING *`,
    values
  );
  if (!rows[0]) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  return NextResponse.json({ data: rows[0] });
});

export const DELETE = withRole(["owner"], async (req: NextRequest, session: AuthSession) => {
  const id = getId(req.url);
  if (!id) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  const pool = getPool();
  const active = await pool.query(
    `SELECT COUNT(*) FROM maintenance_plans WHERE plan_template_id = $1 AND account_id = $2 AND status != 'cancelled'`,
    [id, session.accountId]
  );
  if (parseInt(active.rows[0].count) > 0) {
    return NextResponse.json(
      { error: { code: "CONFLICT", message: "Cannot delete a template with active subscriptions" } },
      { status: 409 }
    );
  }

  await pool.query(`DELETE FROM plan_templates WHERE id = $1 AND account_id = $2`, [id, session.accountId]);
  return new NextResponse(null, { status: 204 });
});
