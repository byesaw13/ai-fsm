import type { PoolClient } from "pg";
import { generateInvoiceNumber } from "@/lib/invoices/db";

/**
 * Side effects that accompany an estimate being approved:
 *  - auto-create the deposit invoice (once) only when deposit_required is true and deposit_cents > 0
 *
 * The deposit invoice is created as a DRAFT (invoice_kind='deposit') so the
 * owner reviews and sends it deliberately — it is never silently put into a
 * billable `sent` state. The final invoice (invoice_kind='final', created by
 * the estimate→invoice Convert path) credits this deposit so the two invoices
 * sum to exactly the estimate total. See lib/invoices/billing.ts and
 * migration 104_invoice_kind.sql.
 *
 * Extracted from the estimate transition route so both the owner-facing
 * transition endpoint and the non-session SMS auto-approve path share one
 * canonical implementation. Caller must run this inside a transaction with
 * RLS context already set (e.g. via withEstimateContext).
 */
export async function createApprovalArtifacts(
  client: PoolClient,
  params: { estimateId: string; accountId: string; userId: string }
): Promise<{ depositInvoiceId: string | null }> {
  const { estimateId, accountId, userId } = params;

  const estData = await client.query<{
    client_id: string;
    job_id: string | null;
    property_id: string | null;
    deposit_cents: number;
    deposit_required: boolean;
    notes: string | null;
  }>(
    `SELECT client_id, job_id, property_id, deposit_cents, deposit_required, notes
     FROM estimates WHERE id = $1`,
    [estimateId]
  );
  const est = estData.rows[0];

  let depositInvoiceId: string | null = null;
  if (est && est.deposit_required && est.deposit_cents > 0) {
    const existingDeposit = await client.query<{ id: string }>(
      `SELECT id FROM invoices
       WHERE estimate_id = $1 AND account_id = $2 AND invoice_kind = 'deposit'
       LIMIT 1`,
      [estimateId, accountId]
    );

    if (existingDeposit.rowCount === 0) {
      const invoiceNumber = await generateInvoiceNumber(client, accountId);
      // Deposit invoice: created as a reviewable DRAFT, not silently `sent`.
      // deposit_cents = 0 on the deposit invoice itself (its own total IS the
      // deposit); the credit is applied to the FINAL invoice instead.
      const depositResult = await client.query<{ id: string }>(
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
          accountId,
          est.client_id,
          est.job_id,
          estimateId,
          est.property_id,
          invoiceNumber,
          est.deposit_cents,
          `Deposit: ${est.notes ?? "Estimate approved"}`,
          userId,
        ]
      );
      depositInvoiceId = depositResult.rows[0].id;
    }
  }

  return { depositInvoiceId };
}
