import type { PoolClient } from "pg";
import { appendAuditLog } from "@/lib/db/audit";
import { createActionItem, resolveActionItems } from "@/lib/action-items";
import { generateInvoiceNumber } from "@/lib/invoices/db";
import { estimateTransitions } from "@ai-fsm/domain";
import type { EstimateStatus } from "@ai-fsm/domain";

/**
 * Side effects that accompany an estimate being approved:
 *  - create the `schedule_job` action item
 *  - auto-create the deposit invoice (once) when deposit_cents > 0
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

  await createActionItem(client, {
    accountId,
    entityType: "estimate",
    entityId: estimateId,
    actionType: "schedule_job",
    title: "Schedule job for approved estimate",
  });

  const estData = await client.query<{
    client_id: string;
    job_id: string | null;
    property_id: string | null;
    deposit_cents: number;
    notes: string | null;
  }>(
    `SELECT client_id, job_id, property_id, deposit_cents, notes
     FROM estimates WHERE id = $1`,
    [estimateId]
  );
  const est = estData.rows[0];

  let depositInvoiceId: string | null = null;
  if (est && est.deposit_cents > 0) {
    const existingDeposit = await client.query<{ id: string }>(
      `SELECT id FROM invoices
       WHERE estimate_id = $1 AND account_id = $2 AND notes LIKE 'Deposit: %'
       LIMIT 1`,
      [estimateId, accountId]
    );

    if (existingDeposit.rowCount === 0) {
      const invoiceNumber = await generateInvoiceNumber(client, accountId);
      const depositResult = await client.query<{ id: string }>(
        `INSERT INTO invoices
           (account_id, client_id, job_id, estimate_id, property_id,
            status, invoice_number,
            subtotal_cents, tax_cents, total_cents, paid_cents, deposit_cents,
            notes, created_by)
         VALUES ($1, $2, $3, $4, $5,
                 'sent', $6,
                 $7, 0, $7, 0, $7,
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

/**
 * Standalone "approve this estimate" operation for non-session callers
 * (e.g. the internal SMS auto-approve path). Validates the transition,
 * flips status to `approved`, resolves the send_estimate action item,
 * creates approval artifacts (schedule_job + deposit invoice), and audits.
 *
 * Returns null when the estimate does not exist or is not in an
 * approvable state (only `sent` → `approved` is permitted), so callers
 * can fall back to flag-only handling.
 *
 * Must be called inside a transaction with RLS context set for the
 * acting account/user (e.g. via withEstimateContext with an owner session).
 */
export async function approveEstimateInTx(
  client: PoolClient,
  params: { estimateId: string; accountId: string; userId: string; traceId?: string }
): Promise<{ depositInvoiceId: string | null; jobId: string | null } | null> {
  const { estimateId, accountId, userId, traceId } = params;

  const existing = await client.query<{ status: EstimateStatus; job_id: string | null }>(
    `SELECT status, job_id FROM estimates WHERE id = $1 AND account_id = $2`,
    [estimateId, accountId]
  );
  if (existing.rowCount === 0) return null;

  const currentStatus = existing.rows[0].status;
  if (!estimateTransitions[currentStatus].includes("approved")) {
    return null;
  }

  await client.query(
    `UPDATE estimates SET status = 'approved', updated_at = now() WHERE id = $1`,
    [estimateId]
  );

  await resolveActionItems(client, {
    accountId,
    entityId: estimateId,
    actionTypes: ["send_estimate"],
    resolvedBy: userId,
  });

  const { depositInvoiceId } = await createApprovalArtifacts(client, {
    estimateId,
    accountId,
    userId,
  });

  await appendAuditLog(client, {
    account_id: accountId,
    entity_type: "estimate",
    entity_id: estimateId,
    action: "update",
    actor_id: userId,
    trace_id: traceId,
    old_value: { status: currentStatus },
    new_value: { status: "approved", deposit_invoice_id: depositInvoiceId, source: "sms_auto_approve" },
  });

  return { depositInvoiceId, jobId: existing.rows[0].job_id };
}
