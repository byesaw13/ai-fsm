/**
 * GET  /api/v1/visits/[id]/assessment  — fetch assessment (null if not yet created)
 * PUT  /api/v1/visits/[id]/assessment  — upsert assessment
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "../../../../../../lib/auth/middleware";
import type { AuthSession } from "../../../../../../lib/auth/middleware";
import { getPool } from "../../../../../../lib/db";
import { logger } from "../../../../../../lib/logger";

export const dynamic = "force-dynamic";

function extractVisitId(url: string) {
  return url.match(/\/visits\/([^/]+)\/assessment/)?.[1] ?? null;
}

const roomSchema = z.object({
  id: z.string(),
  name: z.string().max(100),
  length_ft: z.number().min(0).nullable().optional(),
  width_ft: z.number().min(0).nullable().optional(),
  height_ft: z.number().min(0).nullable().optional(),
  notes: z.string().max(500).optional(),
});

const assessmentSchema = z.object({
  rooms: z.array(roomSchema).default([]),
  scope_notes: z.string().max(5000).nullable().optional(),
  access_notes: z.string().max(2000).nullable().optional(),
  has_pets: z.boolean().optional(),
  difficult_access: z.boolean().optional(),
  asbestos_risk: z.boolean().optional(),
  lead_paint_risk: z.boolean().optional(),
  total_sqft: z.number().min(0).nullable().optional(),
  completed_at: z.string().datetime().nullable().optional(),
});

export const GET = withAuth(async (request: NextRequest, session: AuthSession) => {
  const visitId = extractVisitId(request.url);
  if (!visitId) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Visit not found", traceId: session.traceId } },
      { status: 404 }
    );
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true),
              set_config('app.current_account_id', $2, true),
              set_config('app.current_role', $3, true)`,
      [session.userId, session.accountId, session.role]
    );

    const { rows: visitRows } = await client.query(
      `SELECT id, visit_type, assigned_user_id FROM visits WHERE id = $1 AND account_id = $2`,
      [visitId, session.accountId]
    );
    if (visitRows.length === 0) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Visit not found", traceId: session.traceId } },
        { status: 404 }
      );
    }
    const visit = visitRows[0];
    if (session.role === "tech" && visit.assigned_user_id !== session.userId) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Access denied", traceId: session.traceId } },
        { status: 403 }
      );
    }

    const { rows } = await client.query(
      `SELECT * FROM site_visit_assessments WHERE visit_id = $1 AND account_id = $2`,
      [visitId, session.accountId]
    );

    const photos = await client.query(
      `SELECT id, original_name, mime_type, size_bytes, created_at
       FROM visit_media
       WHERE visit_id = $1 AND account_id = $2 AND category = 'assessment'
       ORDER BY created_at`,
      [visitId, session.accountId]
    );

    return NextResponse.json({
      data: {
        assessment: rows[0] ?? null,
        photos: photos.rows,
      },
    });
  } catch (err) {
    logger.error("GET /api/v1/visits/[id]/assessment error", err, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to load assessment", traceId: session.traceId } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});

export const PUT = withAuth(async (request: NextRequest, session: AuthSession) => {
  const visitId = extractVisitId(request.url);
  if (!visitId) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Visit not found", traceId: session.traceId } },
      { status: 404 }
    );
  }

  let body: unknown = {};
  try { body = await request.json(); } catch { /* empty body is fine */ }

  const parsed = assessmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid body", details: parsed.error.issues, traceId: session.traceId } },
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

    const { rows: visitRows } = await client.query(
      `SELECT id, visit_type, assigned_user_id FROM visits WHERE id = $1 AND account_id = $2 FOR UPDATE`,
      [visitId, session.accountId]
    );
    if (visitRows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Visit not found", traceId: session.traceId } },
        { status: 404 }
      );
    }
    const visit = visitRows[0];
    if (session.role === "tech" && visit.assigned_user_id !== session.userId) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Access denied", traceId: session.traceId } },
        { status: 403 }
      );
    }

    const d = parsed.data;
    const { rows } = await client.query(
      `INSERT INTO site_visit_assessments
         (visit_id, account_id, rooms, scope_notes, access_notes,
          has_pets, difficult_access, asbestos_risk, lead_paint_risk,
          total_sqft, completed_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (visit_id) DO UPDATE SET
         rooms           = EXCLUDED.rooms,
         scope_notes     = EXCLUDED.scope_notes,
         access_notes    = EXCLUDED.access_notes,
         has_pets        = EXCLUDED.has_pets,
         difficult_access = EXCLUDED.difficult_access,
         asbestos_risk   = EXCLUDED.asbestos_risk,
         lead_paint_risk = EXCLUDED.lead_paint_risk,
         total_sqft      = EXCLUDED.total_sqft,
         completed_at    = EXCLUDED.completed_at,
         updated_at      = now()
       RETURNING *`,
      [
        visitId,
        session.accountId,
        JSON.stringify(d.rooms),
        d.scope_notes ?? null,
        d.access_notes ?? null,
        d.has_pets ?? false,
        d.difficult_access ?? false,
        d.asbestos_risk ?? false,
        d.lead_paint_risk ?? false,
        d.total_sqft ?? null,
        d.completed_at ?? null,
        session.userId,
      ]
    );

    await client.query("COMMIT");
    return NextResponse.json({ data: rows[0] }, { status: 200 });
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error("PUT /api/v1/visits/[id]/assessment error", err, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to save assessment", traceId: session.traceId } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});
