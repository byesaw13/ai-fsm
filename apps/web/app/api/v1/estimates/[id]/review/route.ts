import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { withEstimateContext } from "@/lib/estimates/db";
import { reviewEstimate } from "@/lib/estimates/review";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/estimates/[id]/review
 *
 * Analyze an estimate against Dovetails business rules and return
 * actionable suggestions (pricing gaps, margin warnings, scope checks).
 *
 * Returns: { suggestions[], score, summary }
 */
export const POST = withAuth(async (request, session) => {
  const id = request.nextUrl.pathname.split("/").at(-2)!;

  try {
    const estimate = await withEstimateContext(session, async (client) => {
      const result = await client.query(
        `SELECT e.id, e.subtotal_cents, e.total_cents, e.notes,
                e.sq_ft, e.prep_level, e.includes_trim, e.includes_ceiling,
                e.internal_labor_cost_cents, e.internal_material_cost_cents,
                e.target_margin_pct,
                j.job_type
         FROM estimates e
         LEFT JOIN jobs j ON j.id = e.job_id
         WHERE e.id = $1 AND e.account_id = $2`,
        [id, session.accountId]
      );

      if (result.rowCount === 0) {
        throw Object.assign(new Error("Estimate not found"), { code: "NOT_FOUND" });
      }

      const lineItemCount = await client.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM estimate_line_items WHERE estimate_id = $1`,
        [id]
      );

      return {
        ...result.rows[0],
        line_item_count: parseInt(lineItemCount.rows[0]?.count ?? "0", 10),
      };
    });

    const review = reviewEstimate({
      sq_ft: estimate.sq_ft !== null ? Number(estimate.sq_ft) : null,
      prep_level: estimate.prep_level !== null ? Number(estimate.prep_level) : null,
      includes_trim: estimate.includes_trim ?? false,
      includes_ceiling: estimate.includes_ceiling ?? false,
      subtotal_cents: estimate.subtotal_cents,
      total_cents: estimate.total_cents,
      internal_labor_cost_cents: estimate.internal_labor_cost_cents,
      internal_material_cost_cents: estimate.internal_material_cost_cents,
      job_type: estimate.job_type,
      notes: estimate.notes,
      target_margin_pct: estimate.target_margin_pct,
      line_item_count: estimate.line_item_count,
    });

    return NextResponse.json(review);
  } catch (error) {
    const err = error as Error & { code?: string };
    if (err.code === "NOT_FOUND") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Estimate not found", traceId: session.traceId } },
        { status: 404 }
      );
    }
    logger.error("POST /api/v1/estimates/[id]/review error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to review estimate", traceId: session.traceId } },
      { status: 500 }
    );
  }
});
