import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/middleware";
import { appendAuditLog } from "@/lib/db/audit";
import { withInvoiceContext, generateInvoiceNumber } from "@/lib/invoices/db";
import { defaultDepositCents } from "@/lib/invoices/deposit";
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
        existing_deposit_id: string | null;
        final_invoice_id: string | null;
      }>(
        `SELECT j.client_id, j.property_id, e.id AS estimate_id,
                e.total_cents, e.deposit_cents,
                (SELECT id FROM invoices
                  WHERE estimate_id = e.id AND account_id = j.account_id
                    AND invoice_kind = 'deposit' AND status <> 'void'
                  ORDER BY created_at DESC LIMIT 1) AS existing_deposit_id,
                (SELECT id FROM invoices
                  WHERE estimate_id = e.id AND account_id = j.account_id
                    AND invoice_kind = 'final' AND status <> 'void'
                  LIMIT 1) AS final_invoice_id
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

      // Idempotent: at most one deposit invoice per estimate.
      if (job.existing_deposit_id) {
        return { invoice_id: job.existing_deposit_id, created: false };
      }

      // A final invoice snapshots its deposit credit at creation, so a deposit
      // created afterward would go uncredited and overcollect — reject that.
      if (job.final_invoice_id) {
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

      const amountCents = defaultDepositCents({
        estimateTotalCents: job.total_cents ?? 0,
        configuredDepositCents: job.deposit_cents,
        depositPercent,
      });

      if (amountCents <= 0) {
        throw Object.assign(
          new Error("No deposit amount — set an estimate total or a company standard deposit %."),
          { code: "NO_AMOUNT" },
        );
      }

      const invoiceNumber = await generateInvoiceNumber(client, session.accountId);

      // Deposit invoice: reviewable DRAFT. Its own total IS the deposit;
      // deposit_cents = 0 on the row (the credit is applied on the FINAL invoice
      // via loadCreditedInvoicesForEstimate). Matches lib/estimates/approve.ts.
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO invoices
           (account_id, client_id, job_id, estimate_id, property_id,
            status, invoice_kind, invoice_number,
            subtotal_cents, tax_cents, total_cents, paid_cents, deposit_cents,
            notes, created_by)
         VALUES ($1, $2, $3, $4, $5,
                 'draft', 'deposit', $6,
                 $7, 0, $7, 0, 0,
                 $8, $9)
         RETURNING id`,
        [
          session.accountId,
          job.client_id,
          jobId,
          job.estimate_id,
          job.property_id,
          invoiceNumber,
          amountCents,
          "Deposit",
          session.userId,
        ],
      );
      const invoiceId = inserted.rows[0].id;

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
    if (err.code === "NO_ESTIMATE" || err.code === "FINAL_EXISTS" || err.code === "NO_AMOUNT") {
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
