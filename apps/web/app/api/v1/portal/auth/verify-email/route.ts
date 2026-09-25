import { NextRequest, NextResponse } from "next/server";
import { getPool, queryOne } from "@/lib/db";
import { appUrl } from "@/lib/email/mailer";
import { appendAuditLog } from "@/lib/db/audit";

export const dynamic = "force-dynamic";

const TOKEN = /^[0-9a-f-]{36}$/i;

// GET: validate only — never consume. Mail scanners and link prefetchers open
// links before the person does; the confirm page POSTs on an explicit click.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  if (!TOKEN.test(token)) {
    return NextResponse.redirect(new URL("/portal/login?error=invalid", appUrl()));
  }
  const row = await queryOne(
    `SELECT 1 FROM portal_magic_links
     WHERE token = $1 AND pending_email IS NOT NULL AND used_at IS NULL AND expires_at > now()`,
    [token],
  );
  if (!row) return NextResponse.redirect(new URL("/portal/login?error=expired", appUrl()));
  return NextResponse.redirect(
    new URL(`/portal/auth/confirm?kind=email&token=${encodeURIComponent(token)}`, appUrl()),
  );
}

/** POST { token } — applies a portal email change (TASK-161). */
export async function POST(request: NextRequest) {
  const { token } = await request.json().catch(() => ({ token: null }));
  if (typeof token !== "string" || !TOKEN.test(token)) {
    return NextResponse.redirect(new URL("/portal/login?error=invalid", appUrl()));
  }

  const db = await getPool().connect();
  try {
    await db.query("BEGIN");
    const { rows } = await db.query<{
      client_id: string; email: string; old_email: string | null; portal_token: string; account_id: string;
    }>(
      `UPDATE portal_magic_links ml
       SET used_at = now()
       FROM clients c
       WHERE ml.token = $1 AND ml.pending_email IS NOT NULL
         AND ml.used_at IS NULL AND ml.expires_at > now()
         AND c.id = ml.client_id
       RETURNING ml.client_id::text, ml.pending_email AS email, c.email AS old_email,
                 c.portal_token::text, c.account_id::text`,
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
    await db.query(
      `SELECT set_config('app.current_account_id', $1, true), set_config('app.current_role', 'owner', true)`,
      [row.account_id],
    );
    await db.query(`UPDATE clients SET email = $2, updated_at = now() WHERE id = $1`, [row.client_id, row.email]);
    await appendAuditLog(db, {
      account_id: row.account_id,
      entity_type: "client",
      entity_id: row.client_id,
      action: "update",
      actor_id: row.client_id, // the customer, via the portal
      old_value: { email: row.old_email },
      new_value: { email: row.email, source: "portal_email_verify" },
    });
    await db.query("COMMIT");
    return NextResponse.redirect(new URL(`/portal/${row.portal_token}?email=updated`, appUrl()));
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  } finally {
    db.release();
  }
}
