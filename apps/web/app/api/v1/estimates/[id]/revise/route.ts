import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { queryOne, query } from "@/lib/db";
import { canCreateEstimates } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/estimates/:id/revise
 * Forks a sent/approved estimate into a new draft revision.
 * The parent estimate remains unchanged (immutable once sent).
 */
export const POST = withAuth(async (request, session) => {
  if (!canCreateEstimates(session.role)) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const id = request.nextUrl.pathname.split("/").at(-2)!;

  const parent = await queryOne<{
    id: string;
    status: string;
    engine_spec: string | null;
    engine_version: string | null;
    revision: number;
    client_id: string;
    job_id: string | null;
    property_id: string | null;
    expires_at: string | null;
    notes: string | null;
    internal_notes: string | null;
  }>(
    `SELECT id, status, engine_spec, engine_version, revision,
            client_id, job_id, property_id, expires_at, notes, internal_notes
     FROM estimates WHERE id = $1 AND account_id = $2`,
    [id, session.accountId]
  );

  if (!parent) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }
  if (parent.status === "draft") {
    return NextResponse.json(
      { error: { code: "ALREADY_DRAFT", message: "Estimate is already a draft. Edit it directly instead of creating a revision." } },
      { status: 409 }
    );
  }

  const newRevision = parent.revision + 1;

  const [created] = await query<{ id: string }>(
    `INSERT INTO estimates
       (account_id, client_id, job_id, property_id, status,
        engine_spec, engine_version, revision, parent_estimate_id,
        notes, internal_notes, expires_at,
        subtotal_cents, total_cents, deposit_cents, balance_cents,
        created_by)
     VALUES
       ($1, $2, $3, $4, 'draft',
        $5, $6, $7, $8,
        $9, $10, $11,
        0, 0, 0, 0,
        $12)
     RETURNING id`,
    [
      session.accountId,
      parent.client_id,
      parent.job_id,
      parent.property_id,
      parent.engine_spec,
      parent.engine_version,
      newRevision,
      parent.id,
      parent.notes,
      parent.internal_notes,
      parent.expires_at,
      session.userId,
    ]
  );

  return NextResponse.json({ id: created.id, revision: newRevision, parentId: parent.id }, { status: 201 });
});
