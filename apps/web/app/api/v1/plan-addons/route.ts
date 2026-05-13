import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { query, getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

const addonBody = z.object({
  name: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  annual_price_cents: z.number().int().min(0),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
});

export const GET = withRole(["owner", "admin"], async (_req: NextRequest, session: AuthSession) => {
  const rows = await query(
    `SELECT a.*,
            COUNT(sa.id) AS subscription_count
     FROM plan_addons a
     LEFT JOIN subscription_addons sa ON sa.addon_id = a.id
     WHERE a.account_id = $1
     GROUP BY a.id
     ORDER BY a.sort_order, a.name`,
    [session.accountId]
  );
  return NextResponse.json({ data: rows });
});

export const POST = withRole(["owner", "admin"], async (req: NextRequest, session: AuthSession) => {
  const body = await req.json().catch(() => null);
  const parsed = addonBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors } },
      { status: 422 }
    );
  }

  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO plan_addons (account_id, name, description, annual_price_cents, is_active, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [
      session.accountId,
      parsed.data.name,
      parsed.data.description ?? null,
      parsed.data.annual_price_cents,
      parsed.data.is_active,
      parsed.data.sort_order,
    ]
  );
  return NextResponse.json({ data: rows[0] }, { status: 201 });
});
