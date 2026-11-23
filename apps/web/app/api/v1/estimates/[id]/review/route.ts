import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/middleware";
import { withEstimateContext } from "@/lib/estimates/db";
import { ReviewFailedError, reviewEstimate, ruleBasedReview } from "@/lib/estimates/review";
import { loadReviewInput, type StoredReview } from "@/lib/estimates/review-input";
import { quoteUpdatedAt } from "@/lib/estimates/quote-version";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/estimates/[id]/review — run on the owner's button only (TASK-195).
 *
 * Reviews the estimate against its hourly baseline, lines and prepared-scope gaps.
 * The result is stored in review_result with review_for_updated_at; the estimate
 * page shows it while the estimate is unchanged, so opening a page never calls AI.
 * Drafts and sent estimates only: later states are immutable.
 */
export const POST = withRole(["owner", "admin"], async (request, session) => {
  const id = request.nextUrl.pathname.split("/").at(-2)!;

  try {
    const loaded = await withEstimateContext(session, (client) => loadReviewInput(client, id, session.accountId));
    if (!loaded) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Estimate not found", traceId: session.traceId } },
        { status: 404 },
      );
    }
    if (loaded.status !== "draft" && loaded.status !== "sent") {
      return NextResponse.json(
        { error: { code: "INVALID_STATE", message: `A ${loaded.status} estimate is not reviewed.`, traceId: session.traceId } },
        { status: 409 },
      );
    }

    let stored: StoredReview;
    try {
      stored = process.env.ANTHROPIC_API_KEY
        ? { result: await reviewEstimate(loaded.input), source: "ai", reviewed_at: new Date().toISOString() }
        : { result: ruleBasedReview(loaded.input), source: "rules", reviewed_at: new Date().toISOString() };
    } catch (error) {
      logger.error("POST /api/v1/estimates/[id]/review AI review failed", error, { traceId: session.traceId });
      const message = error instanceof ReviewFailedError ? error.message : "The review could not be completed.";
      return NextResponse.json(
        { error: { code: "REVIEW_FAILED", message: `${message} Try again.`, traceId: session.traceId } },
        { status: 502 },
      );
    }

    // Stored only if the estimate did not change while the review ran. review_for_updated_at
    // and the trigger's updated_at are both now() in this statement, so they match.
    const saved = await withEstimateContext(session, async (client) => {
      const { rows } = await client.query<{ updated_at: Date }>(
        `UPDATE estimates
         SET review_result = $1::jsonb, review_for_updated_at = now()
         WHERE id = $2 AND account_id = $3
           AND date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $4::timestamptz)
         RETURNING updated_at`,
        [JSON.stringify(stored), id, session.accountId, loaded.updatedAt],
      );
      return rows[0] ?? null;
    });

    return NextResponse.json({
      review: stored,
      stored: saved !== null,
      previous_updated_at: quoteUpdatedAt(loaded.updatedAt),
      updated_at: saved ? quoteUpdatedAt(saved.updated_at) : null,
    });
  } catch (error) {
    logger.error("POST /api/v1/estimates/[id]/review error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to review estimate", traceId: session.traceId } },
      { status: 500 },
    );
  }
});
