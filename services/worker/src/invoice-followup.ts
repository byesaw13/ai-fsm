import type { Client } from "pg";
import { logger } from "./logger.js";

/**
 * Overdue Invoice Follow-Up Automation
 *
 * Finds overdue invoices eligible for follow-up based on the
 * automation's `config.days_overdue` thresholds. For each eligible
 * invoice, emits a follow-up event (audit_log entry) and marks it
 * sent to prevent duplicates on subsequent runs.
 *
 * Idempotency: Uses audit_log as the sent-record. Before emitting a
 * follow-up, checks for an existing `invoice_followup` audit entry
 * for the same invoice at the same cadence step. If found, skips it.
 *
 * Retry safety: Each invoice is processed independently. A failure
 * on one invoice does not prevent processing of others. The
 * automation's `last_run_at` and `next_run_at` are updated after
 * processing.
 *
 * Cadence: config.days_overdue is an array of day thresholds
 * (e.g., [7, 14, 30]). A follow-up is emitted for each threshold
 * that the invoice has crossed, once per threshold.
 *
 * Source evidence:
 *   - AI-FSM: docs/contracts/workflow-states.md — invoice_followup automation type
 *   - AI-FSM: db/migrations/001_core_schema.sql — invoices.due_date, automations.config
 *   - AI-FSM: services/worker/src/visit-reminder.ts — P4-T1 reliability patterns
 *   - Myprogram: EDGE_FUNCTIONS_RUNBOOK.md — idempotent worker pattern
 *   - Dovelite: scripts/preflight.mjs — safe retry/check-before-act pattern
 */

export interface AutomationRow {
  id: string;
  account_id: string;
  type: string;
  config: { days_overdue?: number[] };
  enabled: boolean;
  next_run_at: string;
}

export interface OverdueInvoice {
  id: string;
  account_id: string;
  client_id: string;
  invoice_number: string;
  status: string;
  total_cents: number;
  paid_cents: number;
  due_date: string;
  client_name: string | null;
}

export interface FollowupResult {
  automationId: string;
  accountId: string;
  sent: number;
  skipped: number;
  errors: number;
}

const DEFAULT_DAYS_OVERDUE = [7, 14, 30];

/**
 * Find all invoice_followup automations that are due to run.
 */
export async function findDueFollowups(client: Client): Promise<AutomationRow[]> {
  const { rows } = await client.query<AutomationRow>(
    `SELECT id, account_id, type, config, enabled, next_run_at::text
     FROM automations
     WHERE type = 'invoice_followup'
       AND enabled = true
       AND next_run_at <= now()`
  );
  return rows;
}

/**
 * Find invoices eligible for follow-up under a specific automation.
 *
 * An invoice is eligible if:
 * 1. It belongs to the same account as the automation
 * 2. Its status is 'overdue' (or 'sent'/'partial' with due_date past)
 * 3. Its `due_date` is in the past
 * 4. It has been overdue for at least one of the configured day thresholds
 */
export async function findOverdueInvoices(
  client: Client,
  automation: AutomationRow
): Promise<OverdueInvoice[]> {
  const { rows } = await client.query<OverdueInvoice>(
    `SELECT i.id, i.account_id, i.client_id, i.invoice_number,
            i.status, i.total_cents, i.paid_cents,
            i.due_date::text, c.name AS client_name
     FROM invoices i
     JOIN clients c ON c.id = i.client_id
     WHERE i.account_id = $1
       AND i.status IN ('overdue', 'sent', 'partial')
       AND i.due_date IS NOT NULL
       AND i.due_date < now()
     ORDER BY i.due_date ASC`,
    [automation.account_id]
  );

  return rows;
}

/**
 * Calculate which cadence steps an invoice has crossed.
 *
 * For example, if days_overdue = [7, 14, 30] and the invoice has been
 * overdue for 16 days, this returns [7, 14].
 */
export function getCadenceSteps(
  dueDate: string,
  daysOverdue: number[],
  now?: Date
): number[] {
  const due = new Date(dueDate);
  const current = now ?? new Date();
  const elapsedMs = current.getTime() - due.getTime();
  const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);

  return daysOverdue
    .filter((d) => elapsedDays >= d)
    .sort((a, b) => a - b);
}

/**
 * Emit a follow-up event for a single invoice at a specific cadence step.
 * Uses audit_log as the event store — also serves as the duplicate guard.
 *
 * The cadence step is stored in new_value.days_overdue_step so we can
 * distinguish between different follow-up levels (e.g., 7-day vs 30-day).
 *
 * Returns true if emitted, false if already exists (idempotent).
 */
export async function emitInvoiceFollowup(
  client: Client,
  invoice: OverdueInvoice,
  automationId: string,
  cadenceStep: number
): Promise<boolean> {
  // Check for existing follow-up at this cadence step
  const { rowCount } = await client.query(
    `SELECT 1 FROM audit_log
     WHERE entity_type = 'invoice_followup'
       AND entity_id = $1
       AND account_id = $2
       AND new_value->>'days_overdue_step' = $3
     LIMIT 1`,
    [invoice.id, invoice.account_id, String(cadenceStep)]
  );

  if (rowCount && rowCount > 0) {
    return false; // Already sent for this cadence step
  }

  await client.query(
    `INSERT INTO audit_log
       (account_id, entity_type, entity_id, action, actor_id, old_value, new_value)
     VALUES ($1, 'invoice_followup', $2, 'insert', $3, NULL, $4)`,
    [
      invoice.account_id,
      invoice.id,
      automationId,
      JSON.stringify({
        automation_id: automationId,
        days_overdue_step: cadenceStep,
        invoice_number: invoice.invoice_number,
        invoice_status: invoice.status,
        total_cents: invoice.total_cents,
        paid_cents: invoice.paid_cents,
        amount_due_cents: invoice.total_cents - invoice.paid_cents,
        due_date: invoice.due_date,
        client_id: invoice.client_id,
        client_name: invoice.client_name,
        followup_sent_at: new Date().toISOString(),
      }),
    ]
  );

  return true;
}

/**
 * Update the automation's timestamps after a run.
 * Sets `last_run_at = now()` and advances `next_run_at` by 1 hour.
 */
export async function markAutomationRun(
  client: Client,
  automationId: string
): Promise<void> {
  await client.query(
    `UPDATE automations
     SET last_run_at = now(),
         next_run_at = now() + interval '1 hour',
         updated_at = now()
     WHERE id = $1`,
    [automationId]
  );
}

/**
 * Process a single invoice_followup automation:
 * 1. Find overdue invoices
 * 2. For each invoice, determine which cadence steps have been crossed
 * 3. Emit follow-ups for each crossed step (idempotent)
 * 4. Update automation timestamps
 *
 * Each invoice is processed independently — errors on one don't block others.
 */
export async function processInvoiceFollowup(
  client: Client,
  automation: AutomationRow
): Promise<FollowupResult> {
  const result: FollowupResult = {
    automationId: automation.id,
    accountId: automation.account_id,
    sent: 0,
    skipped: 0,
    errors: 0,
  };

  const daysOverdue = automation.config.days_overdue ?? DEFAULT_DAYS_OVERDUE;
  const invoices = await findOverdueInvoices(client, automation);

  for (const invoice of invoices) {
    try {
      const steps = getCadenceSteps(invoice.due_date, daysOverdue);

      for (const step of steps) {
        try {
          const emitted = await emitInvoiceFollowup(
            client,
            invoice,
            automation.id,
            step
          );
          if (emitted) {
            result.sent++;
          } else {
            result.skipped++;
          }
        } catch (error) {
          result.errors++;
          logger.error("invoice-followup: failed to emit for invoice", error, { invoiceId: invoice.id, step });
        }
      }
    } catch (error) {
      result.errors++;
      logger.error("invoice-followup: failed to process invoice", error, { invoiceId: invoice.id });
    }
  }

  await markAutomationRun(client, automation.id);

  return result;
}

/**
 * Top-level: run all due invoice_followup automations.
 * Called by the worker poll loop. Safe to call repeatedly.
 */
export async function runInvoiceFollowups(client: Client): Promise<FollowupResult[]> {
  const automations = await findDueFollowups(client);
  const results: FollowupResult[] = [];

  for (const automation of automations) {
    try {
      const result = await processInvoiceFollowup(client, automation);
      results.push(result);
      logger.info("invoice-followup: processed", {
        automationId: automation.id,
        accountId: automation.account_id,
        sent: result.sent,
        skipped: result.skipped,
        errors: result.errors,
      });
    } catch (error) {
      logger.error("invoice-followup: failed to process automation", error, { automationId: automation.id });
    }
  }

  return results;
}
