import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/middleware";
import { appendAuditLog } from "@/lib/db/audit";
import { withInvoiceContext } from "@/lib/invoices/db";
import { createInvoice, findOpenInvoice } from "@/lib/invoices/create-invoice";
import { gatedDepositCents } from "@/lib/invoices/deposit";
import { resolveDepositPolicy } from "@ai-fsm/domain";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/jobs/[id]/deposit-invoice
 *
 * Create (or return) the DEPOSIT invoice for an approved job — the deposit gate
 * (TASK-120). Deposits are normally auto-created on approval when the estimate
 * had `deposit_required`; this covers the common case where none was configured,
 * so "collect a deposit before starting" is one tap with no manual detour.
 *
 * Amount = the estimate's configured deposit when set, else the company standard
 * deposit % of the project total (Settings → Company). Idempotent: if a non-void
 * deposit invoice already exists for the estimate, it is returned unchanged.
 */
export const POST = withRole(["owner", "admin"], async (request, session) => {
  const jobId = request.nextUrl.pathname.split("/").at(-2)!;

  try {
    const result = await withInvoiceContext(session, async (client) => {
      // No jobs.estimate_id column — the link is estimates.job_id; take the
      // latest approved estimate (mirrors progress-invoice / final-invoice).
      const jobRow = await client.query<{
        client_id: string | null;
        property_id: string | null;
        estimate_id: string | null;
        total_cents: number | null;
        deposit_cents: number | null;
      }>(
        `SELECT j.client_id, j.property_id, e.id AS estimate_id,
                e.total_cents, e.deposit_cents
         FROM jobs j
         LEFT JOIN LATERAL (
           SELECT id, total_cents, deposit_cents FROM estimates
           WHERE job_id = j.id AND account_id = j.account_id AND status = 'approved'
           ORDER BY created_at DESC LIMIT 1
         ) e ON true
         WHERE j.id = $1 AND j.account_id = $2`,
        [jobId, session.accountId],
      );
      if (jobRow.rowCount === 0) {
        throw Object.assign(new Error("Job not found"), { code: "NOT_FOUND" });
      }
      const job = jobRow.rows[0];

      if (!job.estimate_id) {
        throw Object.assign(
          new Error("A deposit requires the job to be tied to an approved estimate"),
          { code: "NO_ESTIMATE" },
        );
      }

      const existingDeposit = await findOpenInvoice(client, {
        kind: "deposit", accountId: session.accountId, estimateId: job.estimate_id,
      });
      if (existingDeposit) {
        return { invoice_id: existingDeposit.id, created: false };
      }

      // A final invoice snapshots its deposit credit at creation, so a deposit
      // created afterward would go uncredited and overcollect — reject that.
      if (await findOpenInvoice(client, {
        kind: "final", accountId: session.accountId, jobId, estimateId: job.estimate_id,
      })) {
        throw Object.assign(
          new Error("A final invoice already exists — collect the deposit before the final invoice."),
          { code: "FINAL_EXISTS" },
        );
      }

      // Company standard deposit % (Settings → Company) as the fallback rate.
      const acct = await client.query<{ settings: { deposit_percent?: number; deposit_terms?: string } | null }>(
        `SELECT settings FROM accounts WHERE id = $1`,
        [session.accountId],
      );
      const depositPercent = resolveDepositPolicy(acct.rows[0]?.settings ?? null).percent;

      const already = await client.query<{ sum_cents: string }>(
        `SELECT COALESCE(SUM(total_cents), 0)::bigint AS sum_cents
         FROM invoices
         WHERE estimate_id = $1 AND account_id = $2
           AND invoice_kind IN ('deposit', 'progress')
           AND status <> 'void'`,
        [job.estimate_id, session.accountId],
      );
      const alreadyInvoicedCents = Number(already.rows[0]?.sum_cents ?? 0);

      const amountCents = gatedDepositCents({
        estimateTotalCents: job.total_cents ?? 0,
        configuredDepositCents: job.deposit_cents,
        depositPercent,
        alreadyInvoicedCents,
      });

      if (amountCents <= 0) {
        if (alreadyInvoicedCents > 0) {
          throw Object.assign(
            new Error("Nothing left to bill — existing invoices already cover the project total"),
            { code: "FULLY_INVOICED" },
          );
        }
        throw Object.assign(
          new Error("No deposit amount — set an estimate total or a company standard deposit %."),
          { code: "NO_AMOUNT" },
        );
      }

      // Deposit invoice: reviewable DRAFT. Its own total IS the deposit; the
      // credit is applied on the FINAL invoice (loadCreditedInvoicesForEstimate).
      const created = await createInvoice(client, {
        account_id: session.accountId,
        client_id: job.client_id!,
        job_id: jobId,
        estimate_id: job.estimate_id,
        property_id: job.property_id,
        invoice_kind: "deposit",
        subtotal_cents: amountCents,
        tax_cents: 0,
        total_cents: amountCents,
        notes: "Deposit",
        created_by: session.userId,
      });
      const { id: invoiceId, invoice_number: invoiceNumber } = created;

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "invoice",
        entity_id: invoiceId,
        action: "insert",
        actor_id: session.userId,
        trace_id: session.traceId,
        new_value: {
          source: "deposit_gate",
          job_id: jobId,
          estimate_id: job.estimate_id,
          invoice_number: invoiceNumber,
          invoice_kind: "deposit",
          amount_cents: amountCents,
        },
      });

      return { invoice_id: invoiceId, invoice_number: invoiceNumber, amount_cents: amountCents, created: true };
    });

    return NextResponse.json(result, { status: result.created === false ? 200 : 201 });
  } catch (error) {
    const err = error as Error & { code?: string };
    if (err.code === "NOT_FOUND") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Job not found", traceId: session.traceId } },
        { status: 404 },
      );
    }
    if (err.code === "NO_ESTIMATE" || err.code === "FINAL_EXISTS" || err.code === "NO_AMOUNT" || err.code === "FULLY_INVOICED") {
      return NextResponse.json(
        { error: { code: err.code, message: err.message, traceId: session.traceId } },
        { status: 400 },
      );
    }
    logger.error("POST /api/v1/jobs/[id]/deposit-invoice error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to create deposit invoice", traceId: session.traceId } },
      { status: 500 },
    );
  }
});
