import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "../../../../../../../lib/auth/middleware";
import type { AuthSession } from "../../../../../../../lib/auth/middleware";
import { getPool } from "../../../../../../../lib/db";
import { logger } from "../../../../../../../lib/logger";

export const dynamic = "force-dynamic";

function ids(request: NextRequest) {
  const m = request.url.match(/\/properties\/([^/]+)\/issues\/([^/]+)/);
  return { propertyId: m?.[1] ?? null, issueId: m?.[2] ?? null };
}

const patchBody = z.object({
  status:             z.enum(["open", "monitoring", "resolved", "referred"]).optional(),
  severity:           z.enum(["minor", "moderate", "major", "critical"]).optional(),
  resolved_note:      z.string().max(2000).optional(),
  linked_estimate_id: z.string().uuid().nullable().optional(),
  description:        z.string().max(4000).optional(),
});

export const PATCH = withAuth(async (request: NextRequest, session: AuthSession) => {
  if (!["owner", "admin"].includes(session.role)) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Insufficient role", traceId: session.traceId } },
      { status: 403 }
    );
  }

  const { propertyId, issueId } = ids(request);
  if (!propertyId || !issueId) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Not found", traceId: session.traceId } },
      { status: 404 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = patchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: parsed.error.flatten().fieldErrors, traceId: session.traceId } },
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

    const existing = await client.query(
      `SELECT id, status FROM property_issues
       WHERE id = $1 AND property_id = $2 AND account_id = $3 FOR UPDATE`,
      [issueId, propertyId, session.accountId]
    );
    if (!existing.rows[0]) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Issue not found", traceId: session.traceId } },
        { status: 404 }
      );
    }

    const d = parsed.data;
    const resolvedAt = d.status === "resolved" ? "now()" : "resolved_at";

    const { rows } = await client.query(
      `UPDATE property_issues SET
         status             = COALESCE($4, status),
         severity           = COALESCE($5, severity),
         resolved_note      = COALESCE($6, resolved_note),
         linked_estimate_id = CASE WHEN $7::boolean THEN $8::uuid ELSE linked_estimate_id END,
         description        = COALESCE($9, description),
         resolved_at        = CASE WHEN $4 = 'resolved' THEN now() ELSE resolved_at END,
         updated_at         = now()
       WHERE id = $1 AND property_id = $2 AND account_id = $3
       RETURNING *`,
      [
        issueId, propertyId, session.accountId,
        d.status ?? null,
        d.severity ?? null,
        d.resolved_note ?? null,
        "linked_estimate_id" in d,
        d.linked_estimate_id ?? null,
        d.description ?? null,
      ]
    );

    await client.query("COMMIT");
    return NextResponse.json({ data: rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error("[property issues PATCH]", err, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to update issue", traceId: session.traceId } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});
