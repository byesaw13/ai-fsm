import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { appUrl } from "@/lib/email/mailer";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/portal/auth/verify-email?token= — applies a portal email change
 * (TASK-161). Consuming on GET is fine here: only someone who can read the new
 * inbox can reach this link, which is exactly what we are verifying.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) {
    return NextResponse.redirect(new URL("/portal/login?error=invalid", appUrl()));
  }

  const db = await getPool().connect();
  try {
    await db.query("BEGIN");
    const { rows } = await db.query<{ client_id: string; email: string; portal_token: string; account_id: string }>(
      `UPDATE portal_magic_links ml
       SET used_at = now()
       FROM clients c
       WHERE ml.token = $1 AND ml.pending_email IS NOT NULL
         AND ml.used_at IS NULL AND ml.expires_at > now()
         AND c.id = ml.client_id
       RETURNING ml.client_id::text, ml.pending_email AS email, c.portal_token::text, c.account_id::text`,
      [token],
    );
    const row = rows[0];
    if (!row) {
      await db.query("ROLLBACK");
      return NextResponse.redirect(new URL("/portal/login?error=expired", appUrl()));
    }
    // Re-check: another client may have taken the address since the request.
    const taken = await db.query(
      `SELECT 1 FROM clients WHERE account_id = $1 AND id <> $2 AND lower(email) = lower($3)`,
      [row.account_id, row.client_id, row.email],
    );
    if (taken.rowCount) {
      await db.query("ROLLBACK");
      return NextResponse.redirect(new URL(`/portal/${row.portal_token}?email=conflict`, appUrl()));
    }
    await db.query(`UPDATE clients SET email = $2, updated_at = now() WHERE id = $1`, [row.client_id, row.email]);
    await db.query("COMMIT");
    return NextResponse.redirect(new URL(`/portal/${row.portal_token}?email=updated`, appUrl()));
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  } finally {
    db.release();
  }
}
