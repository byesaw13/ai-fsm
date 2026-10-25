import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { AuthSession } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import { logger } from "@/lib/logger";
import { withInvoiceContext } from "@/lib/invoices/db";
import { sendInvoice } from "@/lib/invoices/send";
import type { DepositDueTrigger } from "./deposit-policy";

/**
 * Deposit request and scheduling on approval (TASK-182).
 *
 * On approval (inside its transaction) `createScheduleItem` opens one
 * "Schedule this job" item whose wording follows the estimate's
 * deposit_due_trigger. After the approval commits, `requestDepositAfterApproval`
 * sends the deposit invoice through the normal send path, recording each
 * attempt so a retry never sends twice and an unknown outcome is never re-sent
 * automatically. Migration 206 moves the item to ready to book when the
 * deposit invoice is fully paid.
 */

const SCHEDULE_ACTION = "schedule_job";

/** Item wording: whether booking waits on the deposit is the estimate's own rule. */
export function scheduleItemTitle(depositRequested: boolean, trigger: DepositDueTrigger | null): string {
  if (!depositRequested) return "Schedule this job — ready to book";
  switch (trigger) {
    case "before_material_order":
      return "Schedule this job — ready to book; deposit due before materials are ordered";
    case "custom":
      return "Schedule this job — ready to book; deposit due per the written terms";
    case "on_acceptance":
    case "before_scheduling":
    default:
      return "Schedule this job — waiting on deposit";
  }
}

/** One open item per job (or estimate when no job was made); a repeat approval adds nothing. */
export async function createScheduleItem(
  client: PoolClient,
  opts: { accountId: string; estimateId: string; jobId: string | null; depositRequested: boolean; trigger: DepositDueTrigger | null },
): Promise<void> {
  await client.query(
    `INSERT INTO action_items (account_id, entity_type, entity_id, action_type, title)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (account_id, entity_id, action_type) WHERE resolved_at IS NULL AND source_capture_id IS NULL DO NOTHING`,
    [
      opts.accountId,
      opts.jobId ? "job" : "estimate",
      opts.jobId ?? opts.estimateId,
      SCHEDULE_ACTION,
      scheduleItemTitle(opts.depositRequested, opts.trigger),
    ],
  );
}

/** Absent or anything but false means on. */
export function autoSendDepositEnabled(settings: unknown): boolean {
  const s = (settings ?? {}) as Record<string, unknown>;
  return s.auto_send_deposit_request !== false;
}

export type DepositRequestOutcome =
  | "sent"
  | "disabled"
  | "no_deposit"
  | "already_handled"
  | "failed"
  | "unknown";

async function noteOnScheduleItem(client: PoolClient, accountId: string, jobId: string | null, estimateId: string, title: string) {
  await client.query(
    `UPDATE action_items SET title = $1
     WHERE account_id = $2 AND action_type = $3 AND resolved_at IS NULL
       AND ((entity_type = 'job' AND entity_id = $4) OR (entity_type = 'estimate' AND entity_id = $5))`,
    [title, accountId, SCHEDULE_ACTION, jobId, estimateId],
  );
}

/**
 * Send the approved estimate's deposit invoice. Call after the approval has
 * committed, never inside it. Never throws; returns what happened.
 */
export async function requestDepositAfterApproval(estimateId: string): Promise<DepositRequestOutcome> {
  try {
    const { rows } = await getPool().query<{
      account_id: string;
      settings: unknown;
      owner_id: string | null;
      invoice_id: string | null;
      job_id: string | null;
    }>(
      `SELECT e.account_id, a.settings,
              (SELECT u.id FROM users u WHERE u.account_id = e.account_id AND u.role = 'owner' LIMIT 1) AS owner_id,
              i.id AS invoice_id, i.job_id
       FROM estimates e
       JOIN accounts a ON a.id = e.account_id
       LEFT JOIN invoices i ON i.estimate_id = e.id AND i.invoice_kind = 'deposit' AND i.status = 'draft'
       WHERE e.id = $1 AND e.status = 'approved'`,
      [estimateId],
    );
    const row = rows[0];
    if (!row || !row.invoice_id || !row.owner_id) return "no_deposit";
    if (!autoSendDepositEnabled(row.settings)) return "disabled";

    const session: AuthSession = { accountId: row.account_id, userId: row.owner_id, role: "owner", traceId: randomUUID() };
    const invoiceId = row.invoice_id;

    // Record the attempt before contacting anyone. Any earlier attempt that was
    // delivered, is still pending, or is unknown blocks an automatic send.
    const attemptId = await withInvoiceContext(session, async (client) => {
      const { rows: prior } = await client.query<{ outcome: string }>(
        `SELECT outcome FROM invoice_delivery_attempts WHERE invoice_id = $1 AND outcome <> 'failed' LIMIT 1`,
        [invoiceId],
      );
      if (prior.length > 0) return null;
      const { rows: inserted } = await client.query<{ id: string }>(
        `INSERT INTO invoice_delivery_attempts (account_id, invoice_id) VALUES ($1, $2) RETURNING id`,
        [row.account_id, invoiceId],
      );
      return inserted[0].id;
    });
    if (!attemptId) return "already_handled";

    let outcome: DepositRequestOutcome;
    let detail: string | null = null;
    try {
      const result = await sendInvoice(session, invoiceId);
      if (result.status === 200) {
        outcome = "sent";
      } else {
        outcome = "failed"; // non-200 results return before anyone is contacted
        detail = result.message ?? `status ${result.status}`;
      }
    } catch (err) {
      outcome = "unknown"; // may have been sent before the error
      detail = (err as Error).message;
    }

    await withInvoiceContext(session, async (client) => {
      await client.query(
        `UPDATE invoice_delivery_attempts SET outcome = $1, detail = $2, updated_at = now() WHERE id = $3`,
        [outcome === "sent" ? "delivered" : outcome, detail, attemptId],
      );
      if (outcome === "failed") {
        await noteOnScheduleItem(client, row.account_id, row.job_id, estimateId,
          `Schedule this job — deposit request not sent (${detail}); send it from the deposit invoice`);
      } else if (outcome === "unknown") {
        await noteOnScheduleItem(client, row.account_id, row.job_id, estimateId,
          "Schedule this job — deposit request may not have gone out; check before resending");
      }
    });
    if (outcome !== "sent") logger.warn("deposit request not delivered", { estimateId, invoiceId, outcome, detail });
    return outcome;
  } catch (err) {
    logger.error("deposit request failed", err, { estimateId });
    return "unknown";
  }
}
