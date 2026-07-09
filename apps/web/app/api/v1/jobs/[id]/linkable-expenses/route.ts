import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/middleware";
import { withExpenseContext } from "@/lib/expenses/db";
import {
  fetchLinkableMaterialExpenses,
  loadJobLinkContext,
} from "@/lib/invoices/job-expenses";
import { logger } from "@ai-fsm/log/web";

export const dynamic = "force-dynamic";

export const GET = withRole(["owner", "admin"], async (request, session) => {
  const jobId = request.nextUrl.pathname.split("/").at(-2)!;

  try {
    const data = await withExpenseContext(session, async (client) => {
      const job = await loadJobLinkContext(client, session.accountId, jobId);
      const expenses = await fetchLinkableMaterialExpenses(
        client,
        session.accountId,
        job.id,
        job.client_id,
      );

      return {
        expenses: expenses.filter((e) => !e.already_on_job),
      };
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

    logger.error("GET /api/v1/jobs/[id]/linkable-expenses error", error, {
      traceId: session.traceId,
    });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to load linkable expenses",
          traceId: session.traceId,
        },
      },
      { status: 500 },
    );
  }
});