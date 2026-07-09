import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { withRole } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import type { PoolClient } from "pg";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@ai-fsm/log/web";
import { accountLogoDir, type CompanyProfileSettings } from "@/lib/company/branding";

export const dynamic = "force-dynamic";

const MAX_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/png", "image/jpeg"]);

function extForMime(mime: string): string {
  return mime === "image/png" ? "png" : "jpg";
}

async function loadSettings(client: PoolClient, accountId: string): Promise<CompanyProfileSettings> {
  const { rows } = await client.query<{ settings: CompanyProfileSettings }>(
    `SELECT settings FROM accounts WHERE id = $1`,
    [accountId],
  );
  return (rows[0]?.settings ?? {}) as CompanyProfileSettings;
}

export const GET = withRole(["owner", "admin"], async (_request: NextRequest, session: AuthSession) => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const settings = await loadSettings(client, session.accountId);
    const filename = settings.logo_filename;
    if (!filename) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "No logo uploaded", traceId: session.traceId } },
        { status: 404 },
      );
    }
    const filePath = path.join(accountLogoDir(session.accountId), path.basename(filename));
    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Logo file not found", traceId: session.traceId } },
        { status: 404 },
      );
    }
    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = ext === ".png" ? "image/png" : "image/jpeg";
    return new NextResponse(buffer, {
      status: 200,
      headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=3600" },
    });
  } finally {
    client.release();
  }
});

export const POST = withRole(["owner", "admin"], async (request: NextRequest, session: AuthSession) => {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "file is required", traceId: session.traceId } },
      { status: 422 },
    );
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Logo must be PNG or JPEG", traceId: session.traceId } },
      { status: 422 },
    );
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Logo must be under 2 MB", traceId: session.traceId } },
      { status: 422 },
    );
  }

  const ext = extForMime(file.type);
  const filename = `logo-${randomUUID().slice(0, 8)}.${ext}`;
  const dir = accountLogoDir(session.accountId);

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true),
              set_config('app.current_account_id', $2, true),
              set_config('app.current_role', $3, true)`,
      [session.userId, session.accountId, session.role],
    );

    const before = await client.query(`SELECT settings FROM accounts WHERE id = $1`, [session.accountId]);
    if (!before.rowCount) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Account not found", traceId: session.traceId } },
        { status: 404 },
      );
    }

    fs.mkdirSync(dir, { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, buffer);

    // Remove prior logo file if present
    const prev = (before.rows[0].settings as CompanyProfileSettings)?.logo_filename;
    if (prev) {
      const prevPath = path.join(dir, path.basename(prev));
      try { fs.unlinkSync(prevPath); } catch { /* ignore */ }
    }

    const patch = { logo_filename: filename };
    const { rows } = await client.query(
      `UPDATE accounts SET settings = settings || $1::jsonb, updated_at = now()
       WHERE id = $2 RETURNING settings`,
      [JSON.stringify(patch), session.accountId],
    );

    await appendAuditLog(client, {
      account_id: session.accountId,
      entity_type: "account",
      entity_id: session.accountId,
      action: "update",
      actor_id: session.userId,
      trace_id: session.traceId,
      old_value: before.rows[0] as Record<string, unknown>,
      new_value: rows[0] as Record<string, unknown>,
    });

    await client.query("COMMIT");
    return NextResponse.json({ data: { logo_filename: filename } });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("POST /api/v1/account/logo error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to upload logo", traceId: session.traceId } },
      { status: 500 },
    );
  } finally {
    client.release();
  }
});

export const DELETE = withRole(["owner", "admin"], async (_request: NextRequest, session: AuthSession) => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const before = await client.query(`SELECT settings FROM accounts WHERE id = $1`, [session.accountId]);
    if (!before.rowCount) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Account not found", traceId: session.traceId } },
        { status: 404 },
      );
    }
    const settings = before.rows[0].settings as CompanyProfileSettings;
    if (settings.logo_filename) {
      const filePath = path.join(accountLogoDir(session.accountId), path.basename(settings.logo_filename));
      try { fs.unlinkSync(filePath); } catch { /* ignore */ }
    }
    const { rows } = await client.query(
      `UPDATE accounts SET settings = settings - 'logo_filename', updated_at = now()
       WHERE id = $1 RETURNING settings`,
      [session.accountId],
    );
    await client.query("COMMIT");
    return NextResponse.json({ data: rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("DELETE /api/v1/account/logo error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to remove logo", traceId: session.traceId } },
      { status: 500 },
    );
  } finally {
    client.release();
  }
});