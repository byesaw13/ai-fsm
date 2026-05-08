import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

function extractId(url: string) {
  return url.match(/\/booking-requests\/([^/]+)/)?.[1] ?? null;
}

export const GET = withRole(["owner", "admin"], async (request: NextRequest, session) => {
  const id = extractId(request.url);
  if (!id) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found", traceId: session.traceId } }, { status: 404 });

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true),
              set_config('app.current_account_id', $2, true),
              set_config('app.current_role', $3, true)`,
      [session.userId, session.accountId, session.role]
    );

    const { rows } = await client.query(
      `SELECT br.*, u.full_name AS reviewed_by_name,
              j.title AS job_title, j.status AS job_status
       FROM booking_requests br
       LEFT JOIN users u ON u.id = br.reviewed_by
       LEFT JOIN jobs j ON j.id = br.job_id
       WHERE br.id = $1 AND br.account_id = $2`,
      [id, session.accountId]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Booking request not found", traceId: session.traceId } }, { status: 404 });
    }

    return NextResponse.json({ data: rows[0] });
  } catch (err) {
    logger.error("GET /api/v1/booking-requests/[id] error", err, { traceId: session.traceId });
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Failed to fetch booking request", traceId: session.traceId } }, { status: 500 });
  } finally {
    client.release();
  }
});

const patchSchema = z.object({
  status: z.enum(["pending", "needs_info", "duplicate", "reviewed", "cancelled"]).optional(),
  review_notes: z.string().max(2000).nullable().optional(),
});

export const PATCH = withRole(["owner", "admin"], async (request: NextRequest, session) => {
  const id = extractId(request.url);
  if (!id) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found", traceId: session.traceId } }, { status: 404 });

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Invalid JSON", traceId: session.traceId } }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Invalid body", details: parsed.error.issues, traceId: session.traceId } }, { status: 422 });
  }

  const { status, review_notes } = parsed.data;
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true),
              set_config('app.current_account_id', $2, true),
              set_config('app.current_role', $3, true)`,
      [session.userId, session.accountId, session.role]
    );

    const { rows: existing } = await client.query(
      `SELECT status FROM booking_requests WHERE id = $1 AND account_id = $2`,
      [id, session.accountId]
    );
    if (existing.length === 0) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Booking request not found", traceId: session.traceId } }, { status: 404 });
    }
    if (existing[0].status === "converted") {
      return NextResponse.json({ error: { code: "CONFLICT", message: "Cannot update a converted booking request", traceId: session.traceId } }, { status: 409 });
    }

    const setClauses: string[] = ["updated_at = now()"];
    const params: unknown[] = [id, session.accountId];
    let idx = 3;

    if (status !== undefined) {
      setClauses.push(`status = $${idx++}`);
      params.push(status);
      setClauses.push(`reviewed_by = $${idx++}`);
      params.push(session.userId);
      setClauses.push(`reviewed_at = now()`);
    }
    if (review_notes !== undefined) {
      setClauses.push(`review_notes = $${idx++}`);
      params.push(review_notes);
    }

    const { rows } = await client.query(
      `UPDATE booking_requests SET ${setClauses.join(", ")}
       WHERE id = $1 AND account_id = $2
       RETURNING *`,
      params
    );

    return NextResponse.json({ data: rows[0] });
  } catch (err) {
    logger.error("PATCH /api/v1/booking-requests/[id] error", err, { traceId: session.traceId });
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Failed to update booking request", traceId: session.traceId } }, { status: 500 });
  } finally {
    client.release();
  }
});
