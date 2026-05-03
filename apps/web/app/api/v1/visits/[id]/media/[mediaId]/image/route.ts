/**
 * GET /api/v1/visits/[id]/media/[mediaId]/image — serve image file from disk
 */
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { withAuth } from "../../../../../../../../lib/auth/middleware";
import type { AuthSession } from "../../../../../../../../lib/auth/middleware";
import { queryOne } from "../../../../../../../../lib/db";
import { logger } from "../../../../../../../../lib/logger";

export const dynamic = "force-dynamic";

export const GET = withAuth(
  async (request: NextRequest, session: AuthSession) => {
    const visitId = request.url.match(/\/visits\/([^/]+)\/media/)?.[1];
    const mediaId = request.url.match(/\/media\/([^/]+)\/image/)?.[1];

    if (!visitId || !mediaId) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Media not found", traceId: session.traceId } },
        { status: 404 }
      );
    }

    // Verify visit is accessible to this session
    const visit = await queryOne<{ id: string; assigned_user_id: string | null }>(
      `SELECT id, assigned_user_id FROM visits WHERE id = $1 AND account_id = $2`,
      [visitId, session.accountId]
    );
    if (!visit) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Visit not found", traceId: session.traceId } },
        { status: 404 }
      );
    }
    if (session.role === "tech" && visit.assigned_user_id !== session.userId) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Access denied", traceId: session.traceId } },
        { status: 403 }
      );
    }

    // Look up the media record
    const media = await queryOne<{ filename: string; mime_type: string }>(
      `SELECT filename, mime_type FROM visit_media WHERE id = $1 AND visit_id = $2 AND account_id = $3`,
      [mediaId, visitId, session.accountId]
    );
    if (!media) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Media not found", traceId: session.traceId } },
        { status: 404 }
      );
    }

    const filePath = path.join("/app/uploads/visits", visitId, media.filename);
    try {
      const buffer = fs.readFileSync(filePath);
      return new NextResponse(buffer, {
        status: 200,
        headers: { "Content-Type": media.mime_type },
      });
    } catch (err) {
      logger.warn("[media image GET] file not found on disk", { filePath, err });
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Image file not found", traceId: session.traceId } },
        { status: 404 }
      );
    }
  }
);
