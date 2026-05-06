import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { query, getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

const pricingBody = z.object({
  tier: z.enum(["essential", "plus", "premier"]),
  annual_price_cents: z.number().int().min(0),
  monthly_price_cents: z.number().int().min(0).default(0),
  is_published: z.boolean().default(false),
  notes: z.string().optional().nullable(),
});

export const GET = withRole(["owner", "admin"], async (_request: NextRequest, session: AuthSession) => {
  const rows = await query(
    `SELECT * FROM membership_pricing_structures
     WHERE account_id = $1
     ORDER BY tier, created_at DESC`,
    [session.accountId]
  );
  return NextResponse.json({ data: rows });
});

export const POST = withRole(["owner", "admin"], async (request: NextRequest, session: AuthSession) => {
  const body = await request.json().catch(() => null);
  const parsed = pricingBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors } },
      { status: 422 }
    );
  }

  const { tier, annual_price_cents, monthly_price_cents, is_published, notes } = parsed.data;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (is_published) {
      // Un-publish any existing active structure for this tier
      await client.query(
        `UPDATE membership_pricing_structures
         SET is_published = false, updated_at = now()
         WHERE account_id = $1 AND tier = $2 AND is_published = true`,
        [session.accountId, tier]
      );
    }

    const result = await client.query(
      `INSERT INTO membership_pricing_structures
         (account_id, tier, annual_price_cents, monthly_price_cents, is_published, published_at, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        session.accountId,
        tier,
        annual_price_cents,
        monthly_price_cents,
        is_published,
        is_published ? new Date().toISOString() : null,
        notes ?? null,
        session.userId,
      ]
    );

    await client.query("COMMIT");
    return NextResponse.json({ data: result.rows[0] }, { status: 201 });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});
