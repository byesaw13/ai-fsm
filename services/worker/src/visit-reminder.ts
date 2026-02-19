import type { Client } from "pg";
import { logger } from "./logger.js";

/**
 * Visit Reminder Automation
 *
 * Finds upcoming visits that are eligible for a reminder based on the
 * automation's `config.hours_before` setting. For each eligible visit,
 * emits a reminder event (audit_log entry) and marks it sent to prevent
 * duplicates on subsequent runs.
 *
 * Idempotency: Uses audit_log as the sent-record. Before emitting a
 * reminder, checks for an existing `visit_reminder` audit entry for
 * the same visit. If found, skips it.
 *
 * Retry safety: Each visit is processed independently. A failure on one
 * visit does not prevent processing of others. The automation's
 * `last_run_at` and `next_run_at` are updated after processing.
 *
 * Source evidence:
 *   - AI-FSM: docs/contracts/workflow-states.md — Automation Types table
 *   - AI-FSM: db/migrations/001_core_schema.sql — automations.config jsonb
 *   - Myprogram: EDGE_FUNCTIONS_RUNBOOK.md — idempotent worker pattern
 *   - Dovelite: scripts/preflight.mjs — safe retry/check-before-act pattern
 */

export interface AutomationRow {
  id: string;
  account_id: string;
  type: string;
  config: { hours_before?: number };
  enabled: boolean;
  next_run_at: string;
}

export interface EligibleVisit {
  id: string;
  account_id: string;
  job_id: string;
  assigned_user_id: string | null;
  scheduled_start: string;
  job_title: string | null;
  client_name: string | null;
}

export interface ReminderResult {
  automationId: string;
  accountId: string;
  sent: number;
  skipped: number;
  errors: number;
}

/**
 * Find all visit_reminder automations that are due to run.
 */
export async function findDueReminders(client: Client): Promise<AutomationRow[]> {
  const { rows } = await client.query<AutomationRow>(
    `SELECT id, account_id, type, config, enabled, next_run_at::text
     FROM automations
     WHERE type = 'visit_reminder'
       AND enabled = true
       AND next_run_at <= now()`
  );
  return rows;
}

/**
 * Find visits eligible for a reminder under a specific automation.
 *
 * A visit is eligible if:
 * 1. It belongs to the same account as the automation
 * 2. Its status is 'scheduled' (not already arrived/completed/cancelled)
 * 3. Its `scheduled_start` is within the `hours_before` window from now
 * 4. No reminder audit entry exists for this visit yet
 */
export async function findEligibleVisits(
  client: Client,
  automation: AutomationRow
): Promise<EligibleVisit[]> {
  const hoursBefore = automation.config.hours_before ?? 24;

  const { rows } = await client.query<EligibleVisit>(
    `SELECT v.id, v.account_id, v.job_id, v.assigned_user_id,
            v.scheduled_start::text, j.title AS job_title, c.name AS client_name
     FROM visits v
     JOIN jobs j ON j.id = v.job_id
     JOIN clients c ON c.id = j.client_id
     WHERE v.account_id = $1
       AND v.status = 'scheduled'
       AND v.scheduled_start > now()
       AND v.scheduled_start <= now() + ($2 || ' hours')::interval
       AND NOT EXISTS (
         SELECT 1 FROM audit_log al
         WHERE al.entity_type = 'visit_reminder'
           AND al.entity_id = v.id
           AND al.account_id = v.account_id
       )
     ORDER BY v.scheduled_start ASC`,
    [automation.account_id, hoursBefore]
  );

  return rows;
}

/**
 * Emit a reminder event for a single visit.
 * Uses audit_log as the event store — this also serves as the duplicate guard.
 *
 * Returns true if emitted, false if already exists (idempotent).
 */
export async function emitVisitReminder(
  client: Client,
  visit: EligibleVisit,
  automationId: string
): Promise<boolean> {
  // Double-check idempotency (race condition guard)
  const { rowCount } = await client.query(
    `SELECT 1 FROM audit_log
     WHERE entity_type = 'visit_reminder'
       AND entity_id = $1
       AND account_id = $2
     LIMIT 1`,
    [visit.id, visit.account_id]
  );

  if (rowCount && rowCount > 0) {
    return false; // Already sent
  }

  await client.query(
    `INSERT INTO audit_log
       (account_id, entity_type, entity_id, action, actor_id, old_value, new_value)
     VALUES ($1, 'visit_reminder', $2, 'insert', $3, NULL, $4)`,
    [
      visit.account_id,
      visit.id,
      automationId, // actor_id = automation ID (system actor)
      JSON.stringify({
        automation_id: automationId,
        visit_scheduled_start: visit.scheduled_start,
        job_id: visit.job_id,
        job_title: visit.job_title,
        client_name: visit.client_name,
        assigned_user_id: visit.assigned_user_id,
        reminder_sent_at: new Date().toISOString(),
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
 * Process a single visit_reminder automation:
 * 1. Find eligible visits
 * 2. Emit reminders for each (idempotent)
 * 3. Update automation timestamps
 *
 * Each visit is processed independently — errors on one don't block others.
 */
export async function processVisitReminder(
  client: Client,
  automation: AutomationRow
): Promise<ReminderResult> {
  const result: ReminderResult = {
    automationId: automation.id,
    accountId: automation.account_id,
    sent: 0,
    skipped: 0,
    errors: 0,
  };

  const visits = await findEligibleVisits(client, automation);

  for (const visit of visits) {
    try {
      const emitted = await emitVisitReminder(client, visit, automation.id);
      if (emitted) {
        result.sent++;
      } else {
        result.skipped++;
      }
    } catch (error) {
      result.errors++;
      logger.error("visit-reminder: failed to emit for visit", error, { visitId: visit.id });
    }
  }

  await markAutomationRun(client, automation.id);

  return result;
}

/**
 * Top-level: run all due visit_reminder automations.
 * Called by the worker poll loop. Safe to call repeatedly.
 */
export async function runVisitReminders(client: Client): Promise<ReminderResult[]> {
  const automations = await findDueReminders(client);
  const results: ReminderResult[] = [];

  for (const automation of automations) {
    try {
      const result = await processVisitReminder(client, automation);
      results.push(result);
      logger.info("visit-reminder: processed", {
        automationId: automation.id,
        accountId: automation.account_id,
        sent: result.sent,
        skipped: result.skipped,
        errors: result.errors,
      });
    } catch (error) {
      logger.error("visit-reminder: failed to process automation", error, { automationId: automation.id });
    }
  }

  return results;
}
