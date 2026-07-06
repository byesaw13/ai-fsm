import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "../../../../../lib/auth/middleware";
import type { AuthSession } from "../../../../../lib/auth/middleware";
import { getPool } from "../../../../../lib/db";
import { normalizeClientName } from "../../../../../lib/crm/normalization";
import { logger } from "../../../../../lib/logger";

export const dynamic = "force-dynamic";

const nullableStr = (max: number) =>
  z.string().max(max).optional().or(z.literal("")).transform((v) => v || null);
// YYYY-MM-DD or empty → null (the importer already normalizes to this shape).
const nullableDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")).transform((v) => v || null);

const rowSchema = z.object({
  name: z.string().min(1).max(255),
  nickname: nullableStr(255),
  email: z.string().email().optional().or(z.literal("")).transform((v) => v || null),
  phone: nullableStr(50),
  company_name: nullableStr(255),
  address_line1: nullableStr(500),
  address_line2: nullableStr(500),
  city: nullableStr(100),
  state: nullableStr(100),
  zip: nullableStr(20),
  notes: z.string().optional().or(z.literal("")).transform((v) => v || null),
  birthday: nullableDate,
  square_customer_id: nullableStr(128),
  creation_source: nullableStr(64),
  first_visit_at: nullableDate,
  last_visit_at: nullableDate,
  transaction_count: z.number().int().nonnegative().optional().default(0),
  lifetime_spend_cents: z.number().int().nonnegative().optional().default(0),
  email_subscription_status: nullableStr(64),
  instant_profile: z.boolean().optional().default(false),
});

export const POST = withAuth(async (request: NextRequest, session: AuthSession) => {
  if (session.role === "tech") {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Not allowed" } }, { status: 403 });
  }

  let rows: unknown[];
  try {
    const body = await request.json();
    rows = Array.isArray(body.rows) ? body.rows : [];
  } catch {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Invalid JSON" } }, { status: 400 });
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "No rows provided" } }, { status: 400 });
  }
  if (rows.length > 1000) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Max 1000 rows per import" } }, { status: 400 });
  }

  const parsed: z.infer<typeof rowSchema>[] = [];
  const parseErrors: { row: number; message: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const result = rowSchema.safeParse(rows[i]);
    if (result.success) {
      parsed.push(result.data);
    } else {
      parseErrors.push({
        row: i + 1,
        message: result.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "),
      });
    }
  }

  if (parseErrors.length > 0) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Some rows are invalid", details: parseErrors } }, { status: 422 });
  }

  const pool = getPool();
  const client = await pool.connect();
  let imported = 0;
  let skipped = 0;

  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true),
              set_config('app.current_account_id', $2, true),
              set_config('app.current_role', $3, true)`,
      [session.userId, session.accountId, session.role]
    );

    for (const row of parsed) {
      // Dedupe: prefer the Square customer id (stable, and many rows have no
      // email); otherwise fall back to exact name+email.
      const exists = row.square_customer_id
        ? await client.query(
            `SELECT id FROM clients WHERE account_id = $1 AND square_customer_id = $2`,
            [session.accountId, row.square_customer_id]
          )
        : await client.query(
            `SELECT id FROM clients WHERE account_id = $1 AND LOWER(name) = LOWER($2) AND LOWER(COALESCE(email,'')) = LOWER(COALESCE($3,''))`,
            [session.accountId, row.name, row.email ?? ""]
          );
      if (exists.rows.length > 0) {
        skipped++;
        continue;
      }

      await client.query(
        `INSERT INTO clients (
           account_id, name, nickname, email, phone, company_name,
           address_line1, address_line2, city, state, zip, notes, birthday,
           square_customer_id, creation_source, first_visit_at, last_visit_at,
           transaction_count, lifetime_spend_cents, email_subscription_status, instant_profile
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
        [
          session.accountId, normalizeClientName(row.name), row.nickname, row.email, row.phone, row.company_name,
          row.address_line1, row.address_line2, row.city, row.state, row.zip, row.notes, row.birthday,
          row.square_customer_id, row.creation_source, row.first_visit_at, row.last_visit_at,
          row.transaction_count, row.lifetime_spend_cents, row.email_subscription_status, row.instant_profile,
        ]
      );
      imported++;
    }

    await client.query("COMMIT");
    return NextResponse.json({ data: { imported, skipped } });
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error("[clients/import]", err);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Import failed" } }, { status: 500 });
  } finally {
    client.release();
  }
});
