/**
 * Review records for store purchase imports (TASK-211).
 * GET: pending and dismissed records plus the pending count and value.
 * POST { ids, action, reason? }: confirm "same" or "different", dismiss or reopen.
 * Each record is handled in its own transaction, so one failure leaves that record
 * exactly as it was and does not block the others.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import { withExpenseContext } from "@/lib/expenses/db";
import {
  confirmReview,
  dismissReview,
  listReviews,
  pendingSummary,
  reopenReview,
  ReviewStateError,
} from "@/lib/expenses/import/reviews";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export const GET = withRole(["owner", "admin"], async (_request: NextRequest, session) => {
  try {
    const data = await withExpenseContext(session, async (client) => ({
      reviews: await listReviews(client, session.accountId),
      pending: await pendingSummary(client, session.accountId),
    }));
    return NextResponse.json({ data });
  } catch (error) {
    logger.error("GET /api/v1/expenses/import/reviews error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to load purchases to review", traceId: session.traceId } },
      { status: 500 },
    );
  }
});

const bodySchema = z
  .object({
    ids: z.array(z.string().uuid()).min(1).max(500),
    action: z.enum(["same", "different", "dismiss", "reopen"]),
    reason: z.string().max(200).optional(),
  })
  .refine((b) => b.action !== "dismiss" || !!b.reason?.trim(), { message: "A reason is required to dismiss", path: ["reason"] });

export const POST = withRole(["owner", "admin"], async (request: NextRequest, session) => {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid request", traceId: session.traceId } },
      { status: 422 },
    );
  }
  const { ids, action, reason } = parsed.data;
  const actor = { accountId: session.accountId, userId: session.userId, traceId: session.traceId };
  const results: { id: string; ok: boolean; error?: string }[] = [];

  for (const id of ids) {
    try {
      await withExpenseContext(session, async (client) => {
        if (action === "same" || action === "different") await confirmReview(client, actor, id, action);
        else if (action === "dismiss") await dismissReview(client, actor, id, reason ?? "");
        else await reopenReview(client, actor, id);
      });
      results.push({ id, ok: true });
    } catch (error) {
      if (!(error instanceof ReviewStateError)) {
        logger.error("POST /api/v1/expenses/import/reviews error", error, { traceId: session.traceId, id, action });
      }
      results.push({ id, ok: false, error: error instanceof ReviewStateError ? error.message : "Could not save this one; it is unchanged" });
    }
  }

  const failed = results.filter((r) => !r.ok).length;
  return NextResponse.json({ data: { results, done: results.length - failed, failed } }, { status: failed === results.length ? 409 : 200 });
});
