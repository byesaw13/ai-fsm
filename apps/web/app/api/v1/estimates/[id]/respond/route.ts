import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getPool } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/estimates/[id]/respond?action=approve|decline&token=<jwt>
 *
 * Public endpoint — no session required. Client clicks link from email.
 * Verifies the HMAC-signed JWT, transitions the estimate, redirects to
 * the thank-you page.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const parts = request.nextUrl.pathname.split("/");
  const id = parts.at(-2)!;
  const action = request.nextUrl.searchParams.get("action");
  const token = request.nextUrl.searchParams.get("token");

  const origin = (process.env.APP_URL ?? "").replace(/\/$/, "") || request.nextUrl.origin;
  const thanksUrl = (a: string) => `${origin}/estimate/thanks?action=${a}`;
  const errorUrl = `${origin}/estimate/thanks?action=error`;

  if (!token || (action !== "approve" && action !== "decline")) {
    return NextResponse.redirect(errorUrl);
  }

  try {
    const secret = new TextEncoder().encode(getEnv().AUTH_SECRET);
    const { payload } = await jwtVerify(token, secret);

    if (payload.estimateId !== id || payload.action !== action) {
      return NextResponse.redirect(errorUrl);
    }
  } catch {
    return NextResponse.redirect(errorUrl);
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    const { rows, rowCount } = await client.query(
      `SELECT id, account_id, status FROM estimates WHERE id = $1`,
      [id]
    );

    if (!rowCount || rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.redirect(errorUrl);
    }

    const est = rows[0] as { id: string; account_id: string; status: string };

    if (!["draft", "sent"].includes(est.status)) {
      await client.query("ROLLBACK");
      return NextResponse.redirect(thanksUrl(action));
    }

    const newStatus = action === "approve" ? "approved" : "declined";

    await client.query(
      `UPDATE estimates SET status = $1, updated_at = now() WHERE id = $2`,
      [newStatus, id]
    );

    await client.query(
      `INSERT INTO audit_log
         (account_id, entity_type, entity_id, action, actor_id, old_value, new_value)
       VALUES ($1, 'estimate', $2, 'client_respond', NULL, $3, $4)`,
      [
        est.account_id,
        id,
        JSON.stringify({ status: est.status }),
        JSON.stringify({ status: newStatus, responded_at: new Date().toISOString(), via: "email_link" }),
      ]
    );

    await client.query("COMMIT");
    return NextResponse.redirect(thanksUrl(action));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    logger.error("GET /api/v1/estimates/[id]/respond error", error, { estimateId: id, action });
    return NextResponse.redirect(errorUrl);
  } finally {
    client.release();
  }
}
