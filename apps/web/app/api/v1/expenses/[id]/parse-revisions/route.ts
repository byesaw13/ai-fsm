/**
 * Receipt parse revisions (TASK-211).
 * GET: the receipt's versions, newest first, and which one is current.
 * POST { revision }: make an earlier version current again (its lines and prices come back).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import { withExpenseContext } from "@/lib/expenses/db";
import { listReceiptRevisions, ReceiptRevisionError, restoreReceiptRevision } from "@/lib/expenses/receipt-revisions";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export const GET = withRole(["owner", "admin"], async (request, session) => {
  const expenseId = request.nextUrl.pathname.split("/").at(-2)!;
  try {
    const data = await withExpenseContext(session, (client) => listReceiptRevisions(client, session.accountId, expenseId));
    return NextResponse.json({ data });
  } catch (error) {
    logger.error("GET /api/v1/expenses/[id]/parse-revisions error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to load receipt versions", traceId: session.traceId } },
      { status: 500 },
    );
  }
});

const bodySchema = z.object({ revision: z.number().int().positive() });

export const POST = withRole(["owner", "admin"], async (request, session) => {
  const expenseId = request.nextUrl.pathname.split("/").at(-2)!;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "revision is required", traceId: session.traceId } },
      { status: 422 },
    );
  }
  try {
    const data = await withExpenseContext(session, async (client) => {
      const restored = await restoreReceiptRevision(
        client,
        { accountId: session.accountId, userId: session.userId, traceId: session.traceId },
        expenseId,
        parsed.data.revision,
      );
      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "expense",
        entity_id: expenseId,
        action: "update",
        actor_id: session.userId,
        trace_id: session.traceId,
        new_value: { action: "restore_receipt_revision", revision: restored.revision, count: restored.line_items.length },
      });
      return restored;
    });
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof ReceiptRevisionError) {
      const status = error.code === "ALREADY_BILLED" ? 409 : 404;
      return NextResponse.json({ error: { code: error.code, message: error.message, traceId: session.traceId } }, { status });
    }
    logger.error("POST /api/v1/expenses/[id]/parse-revisions error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to restore that version", traceId: session.traceId } },
      { status: 500 },
    );
  }
});
