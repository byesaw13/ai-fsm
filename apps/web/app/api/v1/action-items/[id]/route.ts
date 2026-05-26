import { NextRequest, NextResponse } from "next/server";
import { withRole } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export const PATCH = withRole(["owner", "admin"], async (req: NextRequest, session) => {
  const id = req.nextUrl.pathname.split("/").at(-1);
  try {
    const row = await queryOne<{ id: string }>(
      `UPDATE action_items
       SET resolved_at = now(), resolved_by = $1
       WHERE id = $2 AND account_id = $3 AND resolved_at IS NULL
       RETURNING id`,
      [session.userId, id, session.accountId]
    );
    if (!row) return NextResponse.json({ error: { message: "Not found or already resolved" } }, { status: 404 });
    return NextResponse.json({ data: { id: row.id } });
  } catch (error) {
    logger.error("PATCH /api/v1/action-items/[id] error", error, { traceId: session.traceId });
    return NextResponse.json({ error: { message: "Failed to resolve action item" } }, { status: 500 });
  }
});
