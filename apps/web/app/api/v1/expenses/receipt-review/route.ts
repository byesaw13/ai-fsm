import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import { withExpenseContext } from "@/lib/expenses/db";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@/lib/logger";
import {
  RECEIPT_LINKABLE_JOB_STATUS_SQL,
  receiptJobOrderSql,
} from "@/lib/expenses/open-jobs";
import {
  buildPoMatchText,
  displayPoForExpense,
  suggestJobFromPoText,
} from "@/lib/expenses/match-job-po";
import { formatJobPickerLabel } from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

type UnlinkedExpense = {
  id: string;
  vendor_name: string;
  amount_cents: number;
  expense_date: string;
  notes: string | null;
  category: string;
  created_at: string;
};

type OpenJob = {
  id: string;
  title: string;
  job_number: string | null;
  client_id: string | null;
};

/**
 * GET unlinked materials expenses with Supply PO suggestions for human review.
 */
export const GET = withRole(["owner", "admin"], async (_request: NextRequest, session) => {
  try {
    const data = await withExpenseContext(session, async (client) => {
      const expenses = await client.query<UnlinkedExpense>(
        `SELECT e.id, e.vendor_name, e.amount_cents,
                e.expense_date::text AS expense_date,
                e.notes, e.category, e.created_at::text AS created_at
         FROM expenses e
         WHERE e.account_id = $1
           AND e.job_id IS NULL
           AND e.category = 'materials'
           AND e.expense_date >= (CURRENT_DATE - interval '180 days')
         ORDER BY e.expense_date DESC, e.created_at DESC
         LIMIT 100`,
        [session.accountId],
      );

      const jobs = await client.query<OpenJob>(
        `SELECT id, title, job_number, client_id
         FROM jobs
         WHERE account_id = $1
           AND status IN (${RECEIPT_LINKABLE_JOB_STATUS_SQL})
         ORDER BY ${receiptJobOrderSql()}
         LIMIT 200`,
        [session.accountId],
      );

      const items = expenses.rows.map((e) => {
        const extracted_po = displayPoForExpense(e.notes);
        const match = suggestJobFromPoText(
          buildPoMatchText({ notes: e.notes, vendor_name: e.vendor_name, po_number: extracted_po }),
          jobs.rows,
        );
        const suggested = match
          ? (() => {
              const j = jobs.rows.find((row) => row.id === match.jobId);
              return {
                job_id: match.jobId,
                client_id: j?.client_id ?? null,
                job_number: match.jobNumber,
                supply_po: match.supplyPo,
                label: formatJobPickerLabel(j?.title ?? match.jobNumber, j?.job_number ?? match.jobNumber),
                confidence: match.confidence,
              };
            })()
          : null;

        return {
          id: e.id,
          vendor_name: e.vendor_name,
          amount_cents: e.amount_cents,
          expense_date: e.expense_date,
          notes: e.notes,
          category: e.category,
          created_at: e.created_at,
          extracted_po,
          suggestion: suggested,
        };
      });

      return {
        items,
        open_jobs: jobs.rows.map((j) => ({
          id: j.id,
          title: j.title,
          job_number: j.job_number,
          client_id: j.client_id,
          label: formatJobPickerLabel(j.title, j.job_number),
        })),
        suggested_count: items.filter((i) => i.suggestion).length,
      };
    });

    return NextResponse.json({ data });
  } catch (error) {
    logger.error("GET /api/v1/expenses/receipt-review error", error, {
      traceId: session.traceId,
    });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to load receipt review queue",
          traceId: session.traceId,
        },
      },
      { status: 500 },
    );
  }
});

const assignSchema = z.object({
  expense_id: z.string().uuid(),
  job_id: z.string().uuid(),
  client_id: z.string().uuid().nullable().optional(),
});

/**
 * POST assign an unlinked expense to a job (human Accept in review queue).
 */
export const POST = withRole(["owner", "admin"], async (request: NextRequest, session) => {
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

  const parsed = assignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: { issues: parsed.error.issues },
          traceId: session.traceId,
        },
      },
      { status: 400 },
    );
  }

  const { expense_id, job_id, client_id } = parsed.data;

  try {
    const result = await withExpenseContext(session, async (client) => {
      const expense = await client.query<{
        id: string;
        job_id: string | null;
        client_id: string | null;
        vendor_name: string;
      }>(
        `SELECT id, job_id, client_id, vendor_name
         FROM expenses
         WHERE id = $1 AND account_id = $2`,
        [expense_id, session.accountId],
      );
      if (expense.rowCount === 0) {
        throw Object.assign(new Error("Expense not found"), { code: "NOT_FOUND" });
      }
      if (expense.rows[0].job_id) {
        throw Object.assign(new Error("Expense already linked to a project"), {
          code: "CONFLICT",
        });
      }

      const job = await client.query<{ id: string; client_id: string | null }>(
        `SELECT id, client_id FROM jobs WHERE id = $1 AND account_id = $2`,
        [job_id, session.accountId],
      );
      if (job.rowCount === 0) {
        throw Object.assign(new Error("Job not found"), { code: "NOT_FOUND" });
      }

      const nextClientId =
        client_id !== undefined
          ? client_id
          : expense.rows[0].client_id ?? job.rows[0].client_id ?? null;

      await client.query(
        `UPDATE expenses
         SET job_id = $1, client_id = $2, updated_at = now()
         WHERE id = $3 AND account_id = $4`,
        [job_id, nextClientId, expense_id, session.accountId],
      );

      await appendAuditLog(client, {
        account_id: session.accountId,
        actor_id: session.userId,
        action: "update",
        entity_type: "expense",
        entity_id: expense_id,
        trace_id: session.traceId,
        new_value: {
          source: "receipt_review",
          job_id,
          client_id: nextClientId,
        },
      });

      return { id: expense_id, job_id, client_id: nextClientId };
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "NOT_FOUND") {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: (error as Error).message,
            traceId: session.traceId,
          },
        },
        { status: 404 },
      );
    }
    if (code === "CONFLICT") {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: (error as Error).message,
            traceId: session.traceId,
          },
        },
        { status: 409 },
      );
    }
    logger.error("POST /api/v1/expenses/receipt-review error", error, {
      traceId: session.traceId,
    });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to link expense",
          traceId: session.traceId,
        },
      },
      { status: 500 },
    );
  }
});
