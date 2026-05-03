import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "../../../../../lib/auth/middleware";
import type { AuthSession } from "../../../../../lib/auth/middleware";
import { getPool } from "../../../../../lib/db";

export const dynamic = "force-dynamic";

const rowSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().optional().or(z.literal("")).transform((v) => v || null),
  phone: z.string().max(50).optional().or(z.literal("")).transform((v) => v || null),
  company_name: z.string().max(255).optional().or(z.literal("")).transform((v) => v || null),
  address_line1: z.string().max(500).optional().or(z.literal("")).transform((v) => v || null),
  city: z.string().max(100).optional().or(z.literal("")).transform((v) => v || null),
  state: z.string().max(100).optional().or(z.literal("")).transform((v) => v || null),
  zip: z.string().max(20).optional().or(z.literal("")).transform((v) => v || null),
  notes: z.string().optional().or(z.literal("")).transform((v) => v || null),
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
      // Skip exact name+email duplicates already in the account
      const exists = await client.query(
        `SELECT id FROM clients WHERE account_id = $1 AND LOWER(name) = LOWER($2) AND LOWER(COALESCE(email,'')) = LOWER(COALESCE($3,''))`,
        [session.accountId, row.name, row.email ?? ""]
      );
      if (exists.rows.length > 0) {
        skipped++;
        continue;
      }

      await client.query(
        `INSERT INTO clients (account_id, name, email, phone, company_name, address_line1, city, state, zip, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [session.accountId, row.name, row.email, row.phone, row.company_name, row.address_line1, row.city, row.state, row.zip, row.notes]
      );
      imported++;
    }

    await client.query("COMMIT");
    return NextResponse.json({ data: { imported, skipped } });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[clients/import]", err);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Import failed" } }, { status: 500 });
  } finally {
    client.release();
  }
});
