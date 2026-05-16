import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getPool } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getEnv } from "@/lib/env";
import { writeWorkflowEvent } from "@/lib/workflow-events";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/estimates/[id]/respond
 *
 * Public endpoint — no session required. Called by the /estimate/respond
 * confirmation page (the client clicks "Approve/Decline" there, which
 * submits a form POST, keeping GET read-only and safe from bot prefetch).
 *
 * Body (form-encoded or JSON): { action: "approve"|"decline", token: "<jwt>" }
 *
 * Uses an atomic UPDATE ... WHERE status IN ('draft','sent') RETURNING id
 * to enforce first-writer-wins with no TOCTOU race.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const parts = request.nextUrl.pathname.split("/");
  const id = parts.at(-2)!;

  const origin = (process.env.APP_URL ?? "").replace(/\/$/, "") || request.nextUrl.origin;
  const thanksUrl = (a: string) => `${origin}/estimate/thanks?action=${a}`;
  const errorUrl = `${origin}/estimate/thanks?action=error`;

  let action: string | null = null;
  let token: string | null = null;

  const ct = request.headers.get("content-type") ?? "";
  if (ct.includes("application/x-www-form-urlencoded")) {
    const text = await request.text();
    const params = new URLSearchParams(text);
    action = params.get("action");
    token = params.get("token");
  } else {
    try {
      const body = await request.json() as { action?: string; token?: string };
      action = body.action ?? null;
      token = body.token ?? null;
    } catch {
      return NextResponse.redirect(errorUrl);
    }
  }

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
    const newStatus = action === "approve" ? "approved" : "declined";

    // Atomic first-writer-wins: only transitions from draft/sent.
    // If status is already approved/declined/expired, RETURNING returns nothing
    // and we treat it as idempotent success.
    const { rows } = await client.query<{ id: string; account_id: string; old_status: string }>(
      `UPDATE estimates
       SET status = $1, updated_at = now()
       WHERE id = $2 AND status IN ('draft', 'sent')
       RETURNING id, account_id, status AS old_status`,
      [newStatus, id]
    );

    if (rows.length > 0) {
      const { account_id } = rows[0];
      const eventType = action === "approve" ? "estimate.approved" : "estimate.declined";
      // Fire-and-forget audit log and workflow event (non-critical, don't block redirect)
      Promise.all([
        client.query(
          `INSERT INTO audit_log
             (account_id, entity_type, entity_id, action, actor_id, old_value, new_value)
           VALUES ($1, 'estimate', $2, 'update', NULL, $3, $4)`,
          [
            account_id,
            id,
            JSON.stringify({ status: "draft_or_sent" }),
            JSON.stringify({ status: newStatus, responded_at: new Date().toISOString(), via: "email_link" }),
          ]
        ),
        writeWorkflowEvent(client, {
          accountId: account_id,
          eventType,
          entityType: "estimate",
          entityId: id,
        }),
      ]).catch((err) => logger.error("estimate respond: post-update writes failed", err, { estimateId: id }));
    }

    return NextResponse.redirect(thanksUrl(action));
  } catch (error) {
    logger.error("POST /api/v1/estimates/[id]/respond error", error, { estimateId: id, action });
    return NextResponse.redirect(errorUrl);
  } finally {
    client.release();
  }
}
