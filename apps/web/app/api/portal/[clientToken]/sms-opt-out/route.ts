import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ clientToken: string }> }
) {
  const { clientToken } = await params;
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ id: string; account_id: string; sms_consent: boolean }>(
      `SELECT id, account_id, sms_consent FROM clients WHERE portal_token = $1`,
      [clientToken]
    );
    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const row = rows[0];
    if (!row.sms_consent) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Already opted out" }, { status: 409 });
    }
    await client.query(
      `UPDATE clients SET sms_consent = false, sms_consent_at = NOW(), preferred_contact = 'email' WHERE id = $1`,
      [row.id]
    );
    await client.query(`SELECT set_config('app.current_account_id', $1, true)`, [row.account_id]);
    await client.query(
      `INSERT INTO communications_log (account_id, client_id, channel, direction, outcome, body_preview)
       VALUES ($1, $2, 'sms', 'inbound', 'replied', 'STOP (portal opt-out)')`,
      [row.account_id, row.id]
    );
    await client.query("COMMIT");
    return NextResponse.json({ ok: true });
  } catch {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  } finally {
    client.release();
  }
}
