import { NextRequest, NextResponse } from "next/server";
import { withRole } from "@/lib/auth/middleware";
import { query } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export const GET = withRole(["owner", "admin"], async (_req: NextRequest, session) => {
  try {
    const rows = await query(
      `SELECT id, entity_type, entity_id, action_type, title, due_at::text, created_at::text
       FROM action_items
       WHERE account_id = $1 AND resolved_at IS NULL
       ORDER BY due_at ASC NULLS LAST, created_at ASC
       LIMIT 100`,
      [session.accountId]
    );
    return NextResponse.json({ data: rows });
  } catch (error) {
    logger.error("GET /api/v1/action-items error", error, { traceId: session.traceId });
    return NextResponse.json({ error: { message: "Failed to fetch action items" } }, { status: 500 });
  }
});
