import type { Client } from "pg";
import { logger } from "./logger.js";
import { invoiceFollowupEmailHtml } from "@ai-fsm/email-templates";
import { appUrl } from "./mailer.js";
import { enqueueNotification } from "./notification/enqueue.js";
import { PRIORITY } from "./notification/priority.js";
import type { AutomationRow, RunResult } from "./automations/types.js";

/**
 * Full Eastern calendar days past due (0 if due today / future).
 * Kept local — worker image does not ship @ai-fsm/domain (ESM resolution).
 * Must stay aligned with packages/domain calendarDaysOverdue.
 */
export function calendarDaysOverdue(
  dueDate: string | null | undefined,
  now: Date = new Date(),
  timeZone = "America/New_York",
): number {
  if (dueDate == null || dueDate === "") return 0;
  const ymd = (input: Date | string): string => {
    if (typeof input === "string") {
      const s = input.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      const utcMidnight = s.match(
        /^(\d{4}-\d{2}-\d{2})T00:00:00(?:\.\d+)?(?:Z|[+-]00:00)$/,
      );
      if (utcMidnight) return utcMidnight[1];
    }
    const d = typeof input === "string" ? new Date(input) : input;
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  };
  const dueYmd = ymd(dueDate);
  const nowYmd = ymd(now);
  if (!dueYmd || !nowYmd) return 0;
  const [dy, dm, dd] = dueYmd.split("-").map(Number);
  const [ny, nm, nd] = nowYmd.split("-").map(Number);
  const days = Math.round(
    (Date.UTC(dy, dm - 1, dd) - Date.UTC(ny, nm - 1, nd)) / 86_400_000,
  );
  return days < 0 ? -days : 0;
}

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

export type { AutomationRow, RunResult };

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
  client_email: string | null;
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
            i.due_date::text, c.name AS client_name, c.email AS client_email
     FROM invoices i
     JOIN clients c ON c.id = i.client_id
     LEFT JOIN jobs j ON j.id = i.job_id
     WHERE i.account_id = $1
       AND i.status IN ('overdue', 'sent', 'partial')
       AND i.due_date IS NOT NULL
       -- Calendar-day overdue (ET): due local midnight same day must not
       -- count as overdue until the next Eastern calendar day.
       AND (i.due_date AT TIME ZONE 'America/New_York')::date
           < (now() AT TIME ZONE 'America/New_York')::date
       -- TASK-078: never dun a whole-job (standard/final) invoice while the job is
       -- still open — that balance is "due on completion". Deposit invoices ARE due
       -- immediately, so they stay eligible even on an open job.
       AND (
         i.job_id IS NULL
         OR i.invoice_kind = 'deposit'
         OR j.status NOT IN ('draft', 'quoted', 'scheduled', 'in_progress')
       )
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
  // Full Eastern calendar days past due (0 if due today).
  const elapsedDays = calendarDaysOverdue(dueDate, now ?? new Date());

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

  if (invoice.client_email && invoice.client_name) {
    const balanceCents = invoice.total_cents - invoice.paid_cents;
    const viewUrl = `${appUrl()}/app/invoices/${invoice.id}`;
    const enqueueResult = await enqueueNotification(client, {
      accountId: invoice.account_id,
      clientId: invoice.client_id,
      automationType: "invoice_followup",
      priority: PRIORITY.HIGH,
      toAddress: invoice.client_email,
      subject: `Payment reminder: Invoice ${invoice.invoice_number} is ${cadenceStep} days overdue`,
      htmlBody: invoiceFollowupEmailHtml({
        clientName: invoice.client_name,
        invoiceNumber: invoice.invoice_number,
        totalCents: invoice.total_cents,
        balanceCents,
        daysOverdue: cadenceStep,
        viewUrl,
      }),
      idempotencyKey: `invoice_followup:${invoice.id}:${cadenceStep}`,
      entityType: "invoice",
      entityId: invoice.id,
      cancelOnEvents: ["invoice.paid", "invoice.void"],
      metadata: { automationId, cadenceStep },
    });
    if (enqueueResult === "suppressed") {
      logger.debug("invoice-followup: suppressed by governor", { invoiceId: invoice.id, cadenceStep });
      return false;
    }
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
        followup_queued_at: new Date().toISOString(),
      }),
    ]
  );

  return true;
}

/**
 * Process a single invoice_followup automation:
 * 1. Find overdue invoices
 * 2. For each invoice, determine which cadence steps have been crossed
 * 3. Emit follow-ups for each crossed step (idempotent)
 *
 * Each invoice is processed independently — errors on one don't block others.
 * Runner owns next_run_at advancement via advanceNextRun.
 */
export async function processInvoiceFollowup(
  client: Client,
  automation: AutomationRow
): Promise<RunResult> {
  const result: RunResult = {
    automationId: automation.id,
    accountId: automation.account_id,
    sent: 0,
    skipped: 0,
    errors: 0,
  };

  const daysOverdue =
    (automation.config.days_overdue as number[] | undefined) ?? DEFAULT_DAYS_OVERDUE;
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

  return result;
}
