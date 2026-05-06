import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { withAuth } from "../../../../../../../lib/auth/middleware";
import type { AuthSession } from "../../../../../../../lib/auth/middleware";
import { getPool, queryOne } from "../../../../../../../lib/db";
import { logger } from "../../../../../../../lib/logger";

export const dynamic = "force-dynamic";

export const DELETE = withAuth(async (request: NextRequest, session: AuthSession) => {
  const itemId = request.url.match(/\/vault-items\/([^/]+)\/media/)?.[1];
  const mediaId = request.url.match(/\/media\/([^/]+)(?:\/|$)/)?.[1];
  if (!itemId || !mediaId) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Media not found", traceId: session.traceId } },
      { status: 404 }
    );
  }

  const item = await queryOne<{ id: string }>(
    `SELECT id FROM property_vault_items WHERE id = $1 AND account_id = $2`,
    [itemId, session.accountId]
  );
  if (!item) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Vault item not found", traceId: session.traceId } },
      { status: 404 }
    );
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true),
              set_config('app.current_account_id', $2, true),
              set_config('app.current_role', $3, true)`,
      [session.userId, session.accountId, session.role]
    );

    const { rows } = await client.query(
      `DELETE FROM property_vault_item_media
       WHERE id = $1 AND vault_item_id = $2 AND account_id = $3
       RETURNING filename`,
      [mediaId, itemId, session.accountId]
    );

    if (!rows[0]) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Media not found", traceId: session.traceId } },
        { status: 404 }
      );
    }

    await client.query("COMMIT");

    const filePath = path.join("/app/uploads/vault-items", itemId, rows[0].filename);
    try { fs.unlinkSync(filePath); } catch (err) {
      logger.warn("[vault-item-media DELETE] file not found on disk", { filePath, err });
    }

    return NextResponse.json({ data: { deleted: true } });
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error("[vault-item-media DELETE]", err, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to delete media", traceId: session.traceId } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});
