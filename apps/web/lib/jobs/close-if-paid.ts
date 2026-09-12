import type { PoolClient } from "pg";
import { appendAuditLog } from "@/lib/db/audit";

const OPEN_STATUSES = ["draft", "sent", "partial", "overdue"] as const;

export type InvoicePaidSnapshot = {
  invoice_kind: string | null;
  status: string;
};

/** True when a standard/final is paid and no bill (including deposit/progress) is still open. */
export function shouldCloseJobFromInvoices(invoices: InvoicePaidSnapshot[]): boolean {
  const live = invoices.filter((i) => i.status !== "void" && i.status !== "cancelled");
  const paidFinal = live.filter(
    (i) =>
      (i.invoice_kind === "final" || i.invoice_kind === "standard") && i.status === "paid",
  ).length;
  const open = live.filter((i) => (OPEN_STATUSES as readonly string[]).includes(i.status)).length;
  return paidFinal > 0 && open === 0;
}

/**
 * When the job’s bill is fully paid, hop in_progress → completed → invoiced
 * without creating another invoice. Deposit/progress-only payments do not close.
 */
export async function closeJobIfFullyPaid(
  client: PoolClient,
  opts: {
    accountId: string;
    jobId: string;
    actorId: string;
    traceId?: string;
  },
): Promise<{ from: string; to: string } | null> {
  const invoices = await client.query<InvoicePaidSnapshot>(
    `SELECT invoice_kind, status
     FROM invoices
     WHERE job_id = $1 AND account_id = $2`,
    [opts.jobId, opts.accountId],
  );
  if (!shouldCloseJobFromInvoices(invoices.rows)) return null;

  const job = await client.query<{ status: string }>(
    `SELECT status FROM jobs WHERE id = $1 AND account_id = $2 FOR UPDATE`,
    [opts.jobId, opts.accountId],
  );
  const from = job.rows[0]?.status;
  if (!from || from === "invoiced" || from === "cancelled" || from === "scheduled") {
    return null;
  }

  if (from === "in_progress") {
    await client.query(
      `UPDATE jobs SET status = 'completed', updated_at = now()
       WHERE id = $1 AND account_id = $2 AND status = 'in_progress'`,
      [opts.jobId, opts.accountId],
    );
  }

  await client.query(
    `UPDATE jobs SET status = 'invoiced', updated_at = now()
     WHERE id = $1 AND account_id = $2 AND status = 'completed'`,
    [opts.jobId, opts.accountId],
  );

  const after = await client.query<{ status: string }>(
    `SELECT status FROM jobs WHERE id = $1 AND account_id = $2`,
    [opts.jobId, opts.accountId],
  );
  const to = after.rows[0]?.status ?? from;
  if (to === from) return null;

  await appendAuditLog(client, {
    account_id: opts.accountId,
    entity_type: "job",
    entity_id: opts.jobId,
    action: "update",
    actor_id: opts.actorId,
    trace_id: opts.traceId,
    old_value: { status: from },
    new_value: { status: to, reason: "invoice_paid" },
  });

  return { from, to };
}
