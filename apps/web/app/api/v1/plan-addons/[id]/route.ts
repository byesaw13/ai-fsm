import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

const patchBody = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  annual_price_cents: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

function getId(url: string) {
  return url.match(/\/plan-addons\/([^/]+)/)?.[1] ?? null;
}

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
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "No fields to update" } }, { status: 422 });
  }

  const { rows } = await pool.query(
    `UPDATE plan_addons SET ${fields.join(", ")}, updated_at = now()
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
  const inUse = await pool.query(
    `SELECT COUNT(*) FROM subscription_addons sa
     JOIN maintenance_plans mp ON mp.id = sa.subscription_id
     WHERE sa.addon_id = $1 AND mp.account_id = $2 AND mp.status != 'cancelled'`,
    [id, session.accountId]
  );
  if (parseInt(inUse.rows[0].count) > 0) {
    return NextResponse.json(
      { error: { code: "CONFLICT", message: "Cannot delete an add-on that is part of an active subscription" } },
      { status: 409 }
    );
  }

  await pool.query(`DELETE FROM plan_addons WHERE id = $1 AND account_id = $2`, [id, session.accountId]);
  return new NextResponse(null, { status: 204 });
});
