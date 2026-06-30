import type { Client } from "pg";
import { logger } from "./logger.js";
import { estimateFollowupHtml } from "@ai-fsm/email-templates";
import { appUrl } from "./mailer.js";
import type { AutomationRow, ReminderResult } from "./visit-reminder.js";
import { enqueueNotification } from "./notification/enqueue.js";
import { PRIORITY } from "./notification/priority.js";

/**
 * Estimate Follow-up Automation
 *
 * Sends a gentle nudge to clients who received an estimate (status='sent')
 * but haven't actioned it after config.days_after_sent days.
 *
 * Eligible when:
 *  - status = 'sent'
 *  - sent_at is between (now - days - 1d) and (now - days)
 *  - client has an email
 *  - no prior 'estimate_followup' audit entry for this estimate
 */

interface EligibleEstimate {
  id: string;
  account_id: string;
  client_id: string;
  total_cents: number;
  sent_at: string;
  days_since_sent: number;
  client_name: string | null;
  client_email: string | null;
}

export async function findDueEstimateFollowups(client: Client): Promise<AutomationRow[]> {
  const { rows } = await client.query<AutomationRow>(
    `SELECT id, account_id, type, config, enabled, next_run_at::text
       FROM automations
      WHERE type = 'estimate_followup'
        AND enabled = true
        AND next_run_at <= now()`
  );
  return rows;
}

export async function findEligibleEstimates(
  client: Client,
  automation: AutomationRow
): Promise<EligibleEstimate[]> {
  const daysAfter = (automation.config as { days_after_sent?: number }).days_after_sent ?? 3;

  const { rows } = await client.query<EligibleEstimate>(
    `SELECT e.id, e.account_id, c.id AS client_id,
            e.total_cents,
            e.sent_at::text AS sent_at,
            EXTRACT(DAY FROM (now() - e.sent_at))::int AS days_since_sent,
            c.name AS client_name, c.email AS client_email
       FROM estimates e
       JOIN clients c ON c.id = e.client_id AND c.account_id = e.account_id
      WHERE e.account_id = $1
        AND e.status = 'sent'
        AND e.sent_at IS NOT NULL
        AND e.sent_at <= now() - ($2 || ' days')::interval
        AND e.sent_at >  now() - ($2 || ' days')::interval - interval '1 day'
        AND c.email IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM audit_log al
           WHERE al.entity_type = 'estimate_followup'
             AND al.entity_id = e.id
             AND al.account_id = e.account_id
        )
      ORDER BY e.sent_at ASC`,
    [automation.account_id, daysAfter]
  );

  return rows;
}

async function emitEstimateFollowup(
  client: Client,
  est: EligibleEstimate,
  automationId: string
): Promise<boolean> {
  const { rowCount } = await client.query(
    `SELECT 1 FROM audit_log
      WHERE entity_type = 'estimate_followup'
        AND entity_id = $1
        AND account_id = $2
      LIMIT 1`,
    [est.id, est.account_id]
  );
  if (rowCount && rowCount > 0) return false;

  if (est.client_email && est.client_name) {
    const enqueueResult = await enqueueNotification(client, {
      accountId: est.account_id,
      clientId: est.client_id,
      automationType: "estimate_followup",
      priority: PRIORITY.MEDIUM,
      toAddress: est.client_email,
      subject: `Following up on your estimate (#${est.id.slice(0, 8)})`,
      htmlBody: estimateFollowupHtml({
        clientName: est.client_name,
        estimateNumber: est.id.slice(0, 8),
        totalCents: est.total_cents,
        daysSinceSent: est.days_since_sent,
        viewUrl: `${appUrl()}/app/estimates/${est.id}`,
      }),
      idempotencyKey: `estimate_followup:${est.id}`,
      entityType: "estimate",
      entityId: est.id,
      cancelOnEvents: ["estimate.approved", "estimate.declined"],
      metadata: { automationId },
    });
    if (enqueueResult === "suppressed") {
      logger.debug("estimate-followup: suppressed by governor", { estimateId: est.id });
      return false;
    }
  }

  await client.query(
    `INSERT INTO audit_log
       (account_id, entity_type, entity_id, action, actor_id, old_value, new_value)
     VALUES ($1, 'estimate_followup', $2, 'insert', $3, NULL, $4)`,
    [
      est.account_id,
      est.id,
      automationId,
      JSON.stringify({
        automation_id: automationId,
        estimate_number: est.id.slice(0, 8),
        client_name: est.client_name,
        queued_at: new Date().toISOString(),
      }),
    ]
  );
  return true;
}

async function processEstimateFollowups(client: Client, automation: AutomationRow): Promise<ReminderResult> {
  const result: ReminderResult = {
    automationId: automation.id,
    accountId: automation.account_id,
    sent: 0,
    skipped: 0,
    errors: 0,
  };

  const estimates = await findEligibleEstimates(client, automation);
  for (const est of estimates) {
    try {
      const emitted = await emitEstimateFollowup(client, est, automation.id);
      if (emitted) result.sent++;
      else result.skipped++;
    } catch (error) {
      result.errors++;
      logger.error("estimate-followup: failed to emit", error, { estimateId: est.id });
    }
  }

  await client.query(
    `UPDATE automations
        SET last_run_at = now(),
            next_run_at = now() + interval '4 hours',
            updated_at = now()
      WHERE id = $1`,
    [automation.id]
  );

  return result;
}

export async function runEstimateFollowups(client: Client): Promise<ReminderResult[]> {
  const automations = await findDueEstimateFollowups(client);
  const results: ReminderResult[] = [];

  for (const automation of automations) {
    try {
      results.push(await processEstimateFollowups(client, automation));
    } catch (error) {
      logger.error("estimate-followup: automation failed", error, { automationId: automation.id });
    }
  }

  return results;
}
