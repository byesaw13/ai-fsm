import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { queryOne } from "@/lib/db";
import { canCreateEstimates } from "@/lib/auth/permissions";
import { computeAndPersist } from "@/lib/estimates/compute";
import type { EstimateSpec } from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/estimates/:id/recompute
 * Re-runs the engine against the stored spec using the current rate card.
 * Returns a price diff so the UI can show what changed before the user confirms.
 */
export const POST = withAuth(async (request, session) => {
  if (!canCreateEstimates(session.role)) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const id = request.nextUrl.pathname.split("/").at(-2)!;

  const estimate = await queryOne<{
    id: string;
    status: string;
    engine_spec: string | null;
    total_cents: number;
  }>(
    `SELECT id, status, engine_spec, total_cents
     FROM estimates WHERE id = $1 AND account_id = $2`,
    [id, session.accountId]
  );

  if (!estimate) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }
  if (estimate.status === "sent" || estimate.status === "approved") {
    return NextResponse.json(
      { error: { code: "IMMUTABLE", message: "Cannot recompute a sent or approved estimate." } },
      { status: 409 }
    );
  }
  if (!estimate.engine_spec) {
    return NextResponse.json(
      { error: { code: "NO_SPEC", message: "This estimate has no engine spec. Use the new estimate form to add one." } },
      { status: 422 }
    );
  }

  const spec = JSON.parse(estimate.engine_spec) as unknown as EstimateSpec;
  const previousTotal = estimate.total_cents;
  const { result } = await computeAndPersist({ estimateId: id, accountId: session.accountId, spec });

  return NextResponse.json({
    result,
    diff: {
      previousTotalCents: previousTotal,
      newTotalCents: result.summary.totalCents,
      deltaCents: result.summary.totalCents - previousTotal,
    },
  });
});
