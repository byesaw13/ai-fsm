import { NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import { appendAuditLog } from "@/lib/db/audit";
import { withInvoiceContext, generateInvoiceNumber } from "@/lib/invoices/db";
import { clampProgressAmountCents, thirdOfTotalCents } from "@/lib/invoices/progress";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  // Amount to bill now. Omit to default to one third of the project total.
  amount_cents: z.number().int().positive().optional(),
});

/**
 * POST /api/v1/jobs/[id]/progress-invoice
 *
 * Create a staged PROGRESS invoice for a long job (TASK-120, A0b). The job must
 * be tied to an approved estimate — the progress invoice is estimate-linked so
 * the final invoice credits it (see reconcileFinalInvoice) and the stages sum
 * to exactly the project total.
 *
 * Body: { amount_cents?: number } — defaults to ⅓ of the estimate total.
 * The amount is clamped to the remaining balance (total − deposits − prior
 * progress invoices) so staged billing can never exceed the total.
 */
export const POST = withRole(["owner", "admin"], async (request, session) => {
  const jobId = request.nextUrl.pathname.split("/").at(-2)!;

  let requested: number | undefined;
  try {
    const parsed = bodySchema.parse(await request.json().catch(() => ({})));
    requested = parsed.amount_cents;
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid request body", traceId: session.traceId } },
      { status: 400 },
    );
  }

  try {
    const result = await withInvoiceContext(session, async (client) => {
      // The estimate→job relationship lives on estimates.job_id (there is no
      // jobs.estimate_id column); mirror final-invoice.ts and take the latest
      // approved estimate. Also detect an existing final invoice: the final's
      // credit is snapshotted at creation, so a progress invoice made afterward
      // would go uncredited and could overcollect — reject that.
      const jobRow = await client.query<{
        client_id: string | null;
        property_id: string | null;
        estimate_id: string | null;
        total_cents: number | null;
        final_invoice_id: string | null;
      }>(
        `SELECT j.client_id, j.property_id, e.id AS estimate_id, e.total_cents,
                (SELECT id FROM invoices
                  WHERE estimate_id = e.id AND account_id = j.account_id
                    AND invoice_kind = 'final' AND status <> 'void'
                  LIMIT 1) AS final_invoice_id
         FROM jobs j
         LEFT JOIN LATERAL (
           SELECT id, total_cents FROM estimates
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
          new Error("Progress invoices require the job to be tied to an approved estimate"),
          { code: "NO_ESTIMATE" },
        );
      }

      if (job.final_invoice_id) {
        throw Object.assign(
          new Error("A final invoice already exists — progress invoices must be created before the final."),
          { code: "FINAL_EXISTS" },
        );
      }

      const totalCents = job.total_cents ?? 0;

      // Already billed toward the total: non-void deposit + prior progress invoices.
      const already = await client.query<{ sum_cents: string }>(
        `SELECT COALESCE(SUM(total_cents), 0)::bigint AS sum_cents
         FROM invoices
         WHERE estimate_id = $1 AND account_id = $2
           AND invoice_kind IN ('deposit', 'progress')
           AND status <> 'void'`,
        [job.estimate_id, session.accountId],
      );
      const alreadyInvoicedCents = Number(already.rows[0]?.sum_cents ?? 0);

      const amountCents = clampProgressAmountCents({
        totalCents,
        alreadyInvoicedCents,
        requestedCents: requested ?? thirdOfTotalCents(totalCents),
      });

      if (amountCents <= 0) {
        throw Object.assign(
          new Error("Nothing left to bill — deposits and progress invoices already cover the project total"),
          { code: "FULLY_INVOICED" },
        );
      }

      const invoiceNumber = await generateInvoiceNumber(client, session.accountId);

      // Progress invoice: reviewable DRAFT, its own total IS the amount billed
      // now. deposit_cents = 0 here; the credit is applied on the FINAL invoice.
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO invoices
           (account_id, client_id, job_id, estimate_id, property_id,
            status, invoice_kind, invoice_number,
            subtotal_cents, tax_cents, total_cents, paid_cents, deposit_cents,
            notes, created_by)
         VALUES ($1, $2, $3, $4, $5,
                 'draft', 'progress', $6,
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
          "Progress payment",
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
          source: "progress_invoice",
          job_id: jobId,
          estimate_id: job.estimate_id,
          invoice_number: invoiceNumber,
          invoice_kind: "progress",
          amount_cents: amountCents,
        },
      });

      return { invoice_id: invoiceId, invoice_number: invoiceNumber, amount_cents: amountCents };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const err = error as Error & { code?: string };
    if (err.code === "NOT_FOUND") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Job not found", traceId: session.traceId } },
        { status: 404 },
      );
    }
    if (err.code === "NO_ESTIMATE" || err.code === "FULLY_INVOICED" || err.code === "FINAL_EXISTS") {
      return NextResponse.json(
        { error: { code: err.code, message: err.message, traceId: session.traceId } },
        { status: 400 },
      );
    }
    logger.error("POST /api/v1/jobs/[id]/progress-invoice error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to create progress invoice", traceId: session.traceId } },
      { status: 500 },
    );
  }
});
