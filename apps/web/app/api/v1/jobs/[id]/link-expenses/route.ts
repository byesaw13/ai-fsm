import { NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import { appendAuditLog } from "@/lib/db/audit";
import { withExpenseContext } from "@/lib/expenses/db";
import {
  linkMaterialExpensesToJob,
  loadJobLinkContext,
} from "@/lib/invoices/job-expenses";
import { logger } from "@ai-fsm/log/web";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  expense_ids: z.array(z.string().uuid()).min(1).max(20),
});

export const POST = withRole(["owner", "admin"], async (request, session) => {
  const jobId = request.nextUrl.pathname.split("/").at(-2)!;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid JSON body",
          traceId: session.traceId,
        },
      },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "expense_ids must be a non-empty array of UUIDs",
          traceId: session.traceId,
        },
      },
      { status: 400 },
    );
  }

  try {
    const data = await withExpenseContext(session, async (client) => {
      const job = await loadJobLinkContext(client, session.accountId, jobId);
      const { linked } = await linkMaterialExpensesToJob(
        client,
        session.accountId,
        job,
        parsed.data.expense_ids,
      );

      if (linked.length === 0) {
        throw Object.assign(new Error("No expenses were linked"), {
          code: "NO_EXPENSES_LINKED",
        });
      }

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "job",
        entity_id: jobId,
        action: "update",
        actor_id: session.userId,
        trace_id: session.traceId,
        new_value: { action: "link_expenses", linked },
      });

      return { linked };
    });

    return NextResponse.json({ data });
  } catch (error) {
    const err = error as Error & { code?: string };
    if (err.code === "NOT_FOUND") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Job not found", traceId: session.traceId } },
        { status: 404 },
      );
    }
    if (
      err.code === "NO_EXPENSES_LINKED" ||
      err.code === "INVALID_EXPENSE" ||
      err.code === "EXPENSE_ON_OTHER_JOB" ||
      err.code === "EXPENSE_ON_OTHER_CLIENT" ||
      err.code === "EXPENSE_ALREADY_BILLED"
    ) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message, traceId: session.traceId } },
        { status: 400 },
      );
    }

    logger.error("POST /api/v1/jobs/[id]/link-expenses error", error, {
      traceId: session.traceId,
    });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to link expenses to job",
          traceId: session.traceId,
        },
      },
      { status: 500 },
    );
  }
});