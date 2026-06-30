import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "../../../../../../lib/auth/middleware";
import type { AuthSession } from "../../../../../../lib/auth/middleware";
import { getPool } from "../../../../../../lib/db";
import { logger } from "../../../../../../lib/logger";

export const dynamic = "force-dynamic";

const completionPacketBody = z.object({
  // Accept any non-empty string — photo_urls may be absolute URLs (external)
  // or relative /api/v1/.../image paths for media uploaded during the visit.
  photo_urls: z.array(z.string().min(1)).default([]),
  signature_url: z.string().url().nullable().optional(),
  signature_waiver: z.boolean().default(false),
  notes: z.string().max(2000).nullable().optional(),
  photos_waived: z.boolean().default(false),
  photos_waiver_reason: z.string().max(500).nullable().optional(),
});

export const PATCH = withAuth(async (request: NextRequest, session: AuthSession) => {
  const id = request.url.match(/\/visits\/([^/]+)\/completion-packet/)?.[1];

  if (!id) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Visit not found", traceId: session.traceId } },
      { status: 404 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = completionPacketBody.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: parsed.error.flatten().fieldErrors,
          traceId: session.traceId,
        },
      },
      { status: 422 }
    );
  }

  const data = parsed.data;

  // Light validation: waived requires reason. UI primarily enforces; this is defensive.
  if (data.photos_waived && !data.photos_waiver_reason?.trim()) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "photos_waiver_reason is required when photos_waived is true",
          traceId: session.traceId,
        },
      },
      { status: 422 }
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

    const visitResult = await client.query(
      `SELECT id, assigned_user_id, status FROM visits WHERE id = $1 AND account_id = $2`,
      [id, session.accountId]
    );
    const visit = visitResult.rows[0];

    if (!visit || (session.role === "tech" && visit.assigned_user_id !== session.userId)) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Visit not found", traceId: session.traceId } },
        { status: 404 }
      );
    }

    if (visit.status === "completed" || visit.status === "cancelled") {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: { code: "IMMUTABLE_ENTITY", message: "Cannot update completion packet for a closed visit", traceId: session.traceId } },
        { status: 409 }
      );
    }

    const result = await client.query(
      `INSERT INTO completion_packets (
         account_id, visit_id, photo_urls, signature_url, signature_waiver, notes,
         photos_waived, photos_waiver_reason, created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (visit_id) DO UPDATE
       SET photo_urls = EXCLUDED.photo_urls,
           signature_url = EXCLUDED.signature_url,
           signature_waiver = EXCLUDED.signature_waiver,
           notes = EXCLUDED.notes,
           photos_waived = EXCLUDED.photos_waived,
           photos_waiver_reason = EXCLUDED.photos_waiver_reason
       RETURNING *`,
      [
        session.accountId,
        id,
        data.photo_urls,
        data.signature_url || null,
        data.signature_waiver,
        data.notes || null,
        data.photos_waived ?? false,
        data.photos_waiver_reason || null,
        session.userId,
      ]
    );

    await client.query("COMMIT");
    return NextResponse.json({ data: result.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error("[completion packet PATCH]", err, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to save completion packet", traceId: session.traceId } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});
