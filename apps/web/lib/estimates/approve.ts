import type { PoolClient } from "pg";
import { createInvoice } from "@/lib/invoices/create-invoice";
import { createScheduleItem } from "./deposit-request";
import type { DepositDueTrigger } from "./deposit-policy";

/**
 * Side effects that accompany an estimate being approved:
 *  - auto-create the deposit invoice (once) only when deposit_required is true and deposit_cents > 0
 * Callers must create/link the job first so this deposit inherits job_id.
 *
 * The deposit invoice is created as a DRAFT (invoice_kind='deposit'). Sending
 * it happens after the approval commits, through requestDepositAfterApproval
 * (TASK-182), which the account can switch off. The final invoice (invoice_kind='final', created by
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
    deposit_due_trigger: DepositDueTrigger | null;
    notes: string | null;
  }>(
    `SELECT client_id, job_id, property_id, deposit_cents, deposit_required, deposit_due_trigger, notes
     FROM estimates WHERE id = $1`,
    [estimateId]
  );
  const est = estData.rows[0];

  let depositInvoiceId: string | null = null;
  if (est && est.deposit_required && est.deposit_cents > 0) {
    // Deposit invoice: a reviewable DRAFT, not silently `sent`. Its own total
    // IS the deposit; the credit is applied on the FINAL invoice. Returns the
    // open deposit instead when one exists (voided ones don't count).
    const deposit = await createInvoice(client, {
      account_id: accountId,
      client_id: est.client_id,
      job_id: est.job_id,
      estimate_id: estimateId,
      property_id: est.property_id,
      invoice_kind: "deposit",
      subtotal_cents: est.deposit_cents,
      tax_cents: 0,
      total_cents: est.deposit_cents,
      notes: `Deposit: ${est.notes ?? "Estimate approved"}`,
      created_by: userId,
    });
    if (deposit.created) depositInvoiceId = deposit.id;
  }

  // TASK-182: one "Schedule this job" item; whether booking waits on the deposit
  // follows the estimate's deposit_due_trigger. The deposit request itself is
  // sent after the approval commits (requestDepositAfterApproval).
  if (est) {
    await createScheduleItem(client, {
      accountId,
      estimateId,
      jobId: est.job_id,
      depositRequested: est.deposit_required && est.deposit_cents > 0,
      trigger: est.deposit_due_trigger,
    });
  }

  return { depositInvoiceId };
}
