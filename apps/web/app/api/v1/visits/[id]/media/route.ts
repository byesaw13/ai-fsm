/**
 * GET  /api/v1/visits/[id]/media        — list media for a visit
 * POST /api/v1/visits/[id]/media        — upload a new image
 */
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { withAuth } from "../../../../../../lib/auth/middleware";
import type { AuthSession } from "../../../../../../lib/auth/middleware";
import { query, queryOne, getPool } from "../../../../../../lib/db";
import { logger } from "../../../../../../lib/logger";

export const dynamic = "force-dynamic";

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];
const VALID_CATEGORIES = ["before", "after", "receipt"] as const;
type MediaCategory = typeof VALID_CATEGORIES[number];

async function getVisit(visitId: string, session: AuthSession) {
  return queryOne<{ id: string; assigned_user_id: string | null }>(
    `SELECT id, assigned_user_id FROM visits WHERE id = $1 AND account_id = $2`,
    [visitId, session.accountId]
  );
}

export const GET = withAuth(
  async (request: NextRequest, session: AuthSession) => {
    const visitId = request.url.match(/\/visits\/([^/]+)\/media/)?.[1];
    if (!visitId) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Visit not found", traceId: session.traceId } },
        { status: 404 }
      );
    }

    const visit = await getVisit(visitId, session);
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

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");

    const params: unknown[] = [visitId, session.accountId];
    let categoryClause = "";
    if (category && VALID_CATEGORIES.includes(category as MediaCategory)) {
      categoryClause = " AND category = $3";
      params.push(category);
    }

    const rows = await query(
      `SELECT id, visit_id, category, original_name, mime_type, size_bytes, created_at
       FROM visit_media
       WHERE visit_id = $1 AND account_id = $2${categoryClause}
       ORDER BY created_at`,
      params
    );

    return NextResponse.json({ data: rows });
  }
);

export const POST = withAuth(
  async (request: NextRequest, session: AuthSession) => {
    const visitId = request.url.match(/\/visits\/([^/]+)\/media/)?.[1];
    if (!visitId) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Visit not found", traceId: session.traceId } },
        { status: 404 }
      );
    }

    const visit = await getVisit(visitId, session);
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

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Expected multipart form data", traceId: session.traceId } },
        { status: 422 }
      );
    }

    const file = formData.get("file") as File | null;
    const category = formData.get("category") as string | null;

    if (!file) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "file is required", traceId: session.traceId } },
        { status: 422 }
      );
    }
    if (!category || !VALID_CATEGORIES.includes(category as MediaCategory)) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "category must be before, after, or receipt", traceId: session.traceId } },
        { status: 422 }
      );
    }
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "File exceeds 10 MB limit", traceId: session.traceId } },
        { status: 422 }
      );
    }
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Only image files are allowed", traceId: session.traceId } },
        { status: 422 }
      );
    }

    const ext = file.name.split(".").pop() ?? "jpg";
    const uuid = randomUUID();
    const filename = `${uuid}.${ext}`;
    const uploadDir = path.join("/app/uploads/visits", visitId);
    const filePath = path.join(uploadDir, filename);

    try {
      fs.mkdirSync(uploadDir, { recursive: true });
      const buffer = Buffer.from(await file.arrayBuffer());
      fs.writeFileSync(filePath, buffer);
    } catch (err) {
      logger.error("[media POST] file write failed", err, { traceId: session.traceId });
      return NextResponse.json(
        { error: { code: "INTERNAL_ERROR", message: "Failed to save file", traceId: session.traceId } },
        { status: 500 }
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
        `INSERT INTO visit_media (account_id, visit_id, category, filename, original_name, mime_type, size_bytes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, visit_id, category, original_name, mime_type, size_bytes, created_at`,
        [session.accountId, visitId, category, filename, file.name, file.type, file.size, session.userId]
      );

      await client.query("COMMIT");
      return NextResponse.json({ data: rows[0] }, { status: 201 });
    } catch (err) {
      await client.query("ROLLBACK");
      // Clean up written file
      try { fs.unlinkSync(filePath); } catch { /* ignore */ }
      logger.error("[media POST] db insert failed", err, { traceId: session.traceId });
      return NextResponse.json(
        { error: { code: "INTERNAL_ERROR", message: "Failed to save media record", traceId: session.traceId } },
        { status: 500 }
      );
    } finally {
      client.release();
    }
  }
);
