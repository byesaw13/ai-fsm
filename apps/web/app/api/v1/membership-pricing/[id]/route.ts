import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { queryOne, getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

const patchBody = z.object({
  annual_price_cents: z.number().int().min(0).optional(),
  monthly_price_cents: z.number().int().min(0).optional(),
  is_published: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});

export const PATCH = withRole(["owner", "admin"], async (request: NextRequest, session: AuthSession) => {
  const id = request.nextUrl.pathname.split("/").at(-1) ?? "";

  const existing = await queryOne<{ id: string; tier: string; is_published: boolean } & Record<string, unknown>>(
    `SELECT id, tier, is_published FROM membership_pricing_structures WHERE id = $1 AND account_id = $2`,
    [id, session.accountId]
  );
  if (!existing) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors } },
      { status: 422 }
    );
  }

  const { annual_price_cents, monthly_price_cents, is_published, notes } = parsed.data;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (is_published === true && !existing.is_published) {
      await client.query(
        `UPDATE membership_pricing_structures
         SET is_published = false, updated_at = now()
         WHERE account_id = $1 AND tier = $2 AND is_published = true AND id != $3`,
        [session.accountId, existing.tier, id]
      );
    }

    const setClauses: string[] = ["updated_at = now()"];
    const values: unknown[] = [];
    let idx = 1;

    if (annual_price_cents !== undefined) { setClauses.push(`annual_price_cents = $${idx++}`); values.push(annual_price_cents); }
    if (monthly_price_cents !== undefined) { setClauses.push(`monthly_price_cents = $${idx++}`); values.push(monthly_price_cents); }
    if (is_published !== undefined) {
      setClauses.push(`is_published = $${idx++}`);
      values.push(is_published);
      setClauses.push(`published_at = $${idx++}`);
      values.push(is_published ? new Date().toISOString() : null);
    }
    if (notes !== undefined) { setClauses.push(`notes = $${idx++}`); values.push(notes); }

    values.push(id, session.accountId);
    const result = await client.query(
      `UPDATE membership_pricing_structures SET ${setClauses.join(", ")}
       WHERE id = $${idx++} AND account_id = $${idx++}
       RETURNING *`,
      values
    );

    await client.query("COMMIT");
    return NextResponse.json({ data: result.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

export const DELETE = withRole(["owner", "admin"], async (request: NextRequest, session: AuthSession) => {
  const id = request.nextUrl.pathname.split("/").at(-1) ?? "";

  const existing = await queryOne<{ is_published: boolean } & Record<string, unknown>>(
    `SELECT is_published FROM membership_pricing_structures WHERE id = $1 AND account_id = $2`,
    [id, session.accountId]
  );
  if (!existing) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }
  if (existing.is_published) {
    return NextResponse.json(
      { error: { code: "CONFLICT", message: "Cannot delete a published pricing structure. Un-publish it first." } },
      { status: 409 }
    );
  }

  await queryOne(
    `DELETE FROM membership_pricing_structures WHERE id = $1 AND account_id = $2 RETURNING id`,
    [id, session.accountId]
  );
  return new NextResponse(null, { status: 204 });
});
