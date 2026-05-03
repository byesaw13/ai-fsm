/**
 * DELETE /api/v1/visits/[id]/media/[mediaId] — delete a media record and file
 */
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { withAuth } from "../../../../../../../lib/auth/middleware";
import type { AuthSession } from "../../../../../../../lib/auth/middleware";
import { queryOne, getPool } from "../../../../../../../lib/db";
import { logger } from "../../../../../../../lib/logger";

export const dynamic = "force-dynamic";

export const DELETE = withAuth(
  async (request: NextRequest, session: AuthSession) => {
    // Owner/admin only
    if (session.role === "tech") {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Only owner or admin can delete media", traceId: session.traceId } },
        { status: 403 }
      );
    }

    const visitId = request.url.match(/\/visits\/([^/]+)\/media/)?.[1];
    const mediaId = request.url.match(/\/media\/([^/]+)(?:\/|$)/)?.[1];

    if (!visitId || !mediaId) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Media not found", traceId: session.traceId } },
        { status: 404 }
      );
    }

    // Verify visit ownership
    const visit = await queryOne(
      `SELECT id FROM visits WHERE id = $1 AND account_id = $2`,
      [visitId, session.accountId]
    );
    if (!visit) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Visit not found", traceId: session.traceId } },
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
        `DELETE FROM visit_media
         WHERE id = $1 AND visit_id = $2 AND account_id = $3
         RETURNING filename`,
        [mediaId, visitId, session.accountId]
      );

      if (!rows[0]) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Media not found", traceId: session.traceId } },
          { status: 404 }
        );
      }

      await client.query("COMMIT");

      // Delete file from disk (best effort)
      const filePath = path.join("/app/uploads/visits", visitId, rows[0].filename);
      try { fs.unlinkSync(filePath); } catch (err) {
        logger.warn("[media DELETE] file not found on disk", { filePath, err });
      }

      return NextResponse.json({ data: { deleted: true } });
    } catch (err) {
      await client.query("ROLLBACK");
      logger.error("[media DELETE]", err, { traceId: session.traceId });
      return NextResponse.json(
        { error: { code: "INTERNAL_ERROR", message: "Failed to delete media", traceId: session.traceId } },
        { status: 500 }
      );
    } finally {
      client.release();
    }
  }
);
