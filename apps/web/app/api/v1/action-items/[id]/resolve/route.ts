import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { OWNER_PROMISE_ACTION_TYPE } from "@ai-fsm/domain";
import { withRole } from "@/lib/auth/middleware";
import { queryForSession } from "@/lib/db";
import { logger } from "@/lib/logger";
import { CUSTOMER_PROMISE_BUCKET_HREF } from "@/lib/captures/promise-queue";

export const dynamic = "force-dynamic";

type ActionItemResolveRow = {
  id: string;
  resolved_at: string | Date | null;
  resolved_by: string | null;
  action_type?: string;
};

function actionItemIdFromRequest(request: NextRequest): string | undefined {
  const parts = request.nextUrl.pathname.split("/");
  const resolveAt = parts.lastIndexOf("resolve");
  return resolveAt > 0 ? parts[resolveAt - 1] : undefined;
}

function wantsHtml(request: NextRequest): boolean {
  const accept = request.headers.get("accept") ?? "";
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return false;
  return accept.includes("text/html") || contentType.includes("application/x-www-form-urlencoded");
}

function jsonError(status: number, code: string, message: string, traceId: string) {
  return NextResponse.json({ error: { code, message, traceId } }, { status });
}

function resolveResponse(request: NextRequest, row: ActionItemResolveRow) {
  if (wantsHtml(request)) {
    return NextResponse.redirect(new URL(CUSTOMER_PROMISE_BUCKET_HREF, request.url), 303);
  }
  return NextResponse.json({
    data: {
      id: row.id,
      resolved_at: row.resolved_at,
      resolved_by: row.resolved_by,
    },
  });
}

export const POST = withRole(["owner", "admin"], async (request: NextRequest, session) => {
  const rawId = actionItemIdFromRequest(request);
  const parsed = z.string().uuid().safeParse(rawId);
  if (!parsed.success) {
    return jsonError(404, "NOT_FOUND", "Action item not found", session.traceId);
  }
  const id = parsed.data;

  try {
    const existing = await queryForSession<ActionItemResolveRow>(
      session,
      `SELECT id, resolved_at, resolved_by, action_type
       FROM action_items
       WHERE id = $1 AND account_id = $2 AND action_type = $3`,
      [id, session.accountId, OWNER_PROMISE_ACTION_TYPE],
    );
    const row = existing[0];
    if (!row) {
      return jsonError(404, "NOT_FOUND", "Action item not found", session.traceId);
    }
    if (row.resolved_at) {
      return resolveResponse(request, row);
    }

    const updated = await queryForSession<ActionItemResolveRow>(
      session,
      `UPDATE action_items
       SET resolved_at = now(), resolved_by = $1
       WHERE id = $2 AND account_id = $3 AND resolved_at IS NULL
       RETURNING id, resolved_at, resolved_by`,
      [session.userId, id, session.accountId],
    );
    const resolved = updated[0] ?? row;
    return resolveResponse(request, resolved);
  } catch (err) {
    logger.error("[action-items resolve]", err, { traceId: session.traceId });
    return jsonError(500, "INTERNAL_ERROR", "Failed to resolve action item", session.traceId);
  }
});

export const PATCH = POST;
