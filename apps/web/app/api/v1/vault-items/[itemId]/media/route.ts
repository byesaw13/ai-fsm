import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { withAuth } from "../../../../../../lib/auth/middleware";
import type { AuthSession } from "../../../../../../lib/auth/middleware";
import { getPool, query, queryOne } from "../../../../../../lib/db";
import { logger } from "../../../../../../lib/logger";

export const dynamic = "force-dynamic";

const MAX_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];

async function getVaultItem(itemId: string, session: AuthSession) {
  return queryOne<{ id: string }>(
    `SELECT id FROM property_vault_items WHERE id = $1 AND account_id = $2`,
    [itemId, session.accountId]
  );
}

export const GET = withAuth(async (request: NextRequest, session: AuthSession) => {
  const itemId = request.url.match(/\/vault-items\/([^/]+)\/media/)?.[1];
  if (!itemId) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Vault item not found", traceId: session.traceId } },
      { status: 404 }
    );
  }

  const item = await getVaultItem(itemId, session);
  if (!item) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Vault item not found", traceId: session.traceId } },
      { status: 404 }
    );
  }

  const rows = await query(
    `SELECT id, vault_item_id, original_name, mime_type, size_bytes, created_at
     FROM property_vault_item_media
     WHERE vault_item_id = $1 AND account_id = $2
     ORDER BY created_at`,
    [itemId, session.accountId]
  );

  return NextResponse.json({ data: rows });
});

export const POST = withAuth(async (request: NextRequest, session: AuthSession) => {
  const itemId = request.url.match(/\/vault-items\/([^/]+)\/media/)?.[1];
  if (!itemId) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Vault item not found", traceId: session.traceId } },
      { status: 404 }
    );
  }

  const item = await getVaultItem(itemId, session);
  if (!item) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Vault item not found", traceId: session.traceId } },
      { status: 404 }
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
  if (!file) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "file is required", traceId: session.traceId } },
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
  const filename = `${randomUUID()}.${ext}`;
  const uploadDir = path.join("/app/uploads/vault-items", itemId);
  const filePath = path.join(uploadDir, filename);

  try {
    fs.mkdirSync(uploadDir, { recursive: true });
    fs.writeFileSync(filePath, Buffer.from(await file.arrayBuffer()));
  } catch (err) {
    logger.error("[vault-item-media POST] file write failed", err, { traceId: session.traceId });
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

    const ALLOWED_ROLES = ["before", "after", "during", "inspection", "diagram", "general"];
    const photoRole = formData.get("photo_role") as string | null;
    const visitId = formData.get("visit_id") as string | null;
    const pairedMediaId = formData.get("paired_media_id") as string | null;
    const role = photoRole && ALLOWED_ROLES.includes(photoRole) ? photoRole : "general";

    const { rows } = await client.query(
      `INSERT INTO property_vault_item_media
         (account_id, vault_item_id, filename, original_name, mime_type, size_bytes,
          photo_role, visit_id, paired_media_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, vault_item_id, original_name, mime_type, size_bytes,
                 photo_role, visit_id, paired_media_id, created_at`,
      [
        session.accountId, itemId, filename, file.name, file.type, file.size,
        role, visitId ?? null, pairedMediaId ?? null, session.userId,
      ]
    );

    await client.query("COMMIT");
    return NextResponse.json({ data: rows[0] }, { status: 201 });
  } catch (err) {
    await client.query("ROLLBACK");
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
    logger.error("[vault-item-media POST] db insert failed", err, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to save media record", traceId: session.traceId } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});
