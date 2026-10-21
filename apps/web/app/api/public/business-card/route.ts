import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { logger } from "@/lib/logger";
import { resolvePublicCard } from "@/lib/company/public-card";

export const dynamic = "force-dynamic";

/**
 * Public, read-only business card (TASK-177). mydovetails.com fetches this at
 * build time. Only the card fields leave; everything else in account settings
 * stays private. The account is the public-facing one (BOOKING_ACCOUNT_ID).
 */
export async function GET() {
  const accountId = process.env.BOOKING_ACCOUNT_ID;
  if (!accountId) {
    return NextResponse.json(
      { error: { code: "NOT_CONFIGURED", message: "Business card is not configured" } },
      { status: 503 },
    );
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    // No session here, but the account is known; satisfies account-scoped RLS
    // once the app runs as the restricted role. No-op while superuser.
    await client.query(
      `SELECT set_config('app.current_account_id', $1, true),
              set_config('app.current_role', 'owner', true)`,
      [accountId],
    );
    const { rows } = await client.query(`SELECT settings FROM accounts WHERE id = $1`, [accountId]);
    await client.query("COMMIT");
    if (!rows[0]) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Account not found" } },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { data: resolvePublicCard(rows[0].settings) },
      { headers: { "Cache-Control": "public, max-age=60" } },
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    logger.error("GET /api/public/business-card error", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to load business card" } },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}
