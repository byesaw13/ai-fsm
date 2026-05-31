import type { Client } from "pg";
import { logger } from "./logger.js";
import type { AutomationRow, ReminderResult } from "./visit-reminder.js";

/**
 * Lead Follow-Up Automation
 *
 * Surfaces an action item for pending booking requests that have had no
 * activity for more than 24 hours. This is an internal prompt — no client
 * email is sent. The estimator sees it in the inbox and decides the next step.
 *
 * Idempotent: each booking request only gets one follow_up action item created.
 * If it was already resolved (e.g., estimate was sent), it's skipped.
 */

interface StaleLead {
  id: string;
  account_id: string;
  name: string;
  hours_pending: number;
}

export async function findDueLeadFollowups(client: Client): Promise<AutomationRow[]> {
  const { rows } = await client.query<AutomationRow>(
    `SELECT id, account_id, type, config, enabled, next_run_at::text
       FROM automations
      WHERE type = 'lead_followup'
        AND enabled = true
        AND next_run_at <= now()`
  );
  return rows;
}

export async function findStaleLeads(
  client: Client,
  automation: AutomationRow
): Promise<StaleLead[]> {
  const hoursThreshold = (automation.config as { hours_threshold?: number }).hours_threshold ?? 24;

  const { rows } = await client.query<StaleLead>(
    `SELECT br.id, br.account_id, br.name,
            EXTRACT(EPOCH FROM (now() - br.created_at)) / 3600 AS hours_pending
       FROM booking_requests br
      WHERE br.account_id = $1
        AND br.status = 'pending'
        AND br.created_at <= now() - ($2 || ' hours')::interval
        AND NOT EXISTS (
          SELECT 1 FROM action_items ai
           WHERE ai.account_id = br.account_id
             AND ai.entity_id = br.id
             AND ai.action_type = 'follow_up'
             AND ai.resolved_at IS NULL
        )
      ORDER BY br.created_at ASC
      LIMIT 50`,
    [automation.account_id, hoursThreshold]
  );

  return rows;
}

async function createLeadFollowupItem(
  client: Client,
  lead: StaleLead
): Promise<boolean> {
  // Check idempotency — don't create a second open follow_up for the same lead
  const { rowCount } = await client.query(
    `SELECT 1 FROM action_items
      WHERE account_id = $1 AND entity_id = $2 AND action_type = 'follow_up' AND resolved_at IS NULL`,
    [lead.account_id, lead.id]
  );
  if (rowCount && rowCount > 0) return false;

  const due_at = new Date(Date.now() + 2 * 60 * 60 * 1000); // due in 2h
  await client.query(
    `INSERT INTO action_items (account_id, entity_type, entity_id, action_type, title, due_at)
     VALUES ($1, 'booking_request', $2, 'follow_up', $3, $4)
     ON CONFLICT DO NOTHING`,
    [
      lead.account_id,
      lead.id,
      `Follow up with ${lead.name} — pending ${Math.round(lead.hours_pending)}h`,
      due_at,
    ]
  );
  return true;
}

async function processLeadFollowups(client: Client, automation: AutomationRow): Promise<ReminderResult> {
  const result: ReminderResult = {
    automationId: automation.id,
    accountId: automation.account_id,
    sent: 0,
    skipped: 0,
    errors: 0,
  };

  const leads = await findStaleLeads(client, automation);
  for (const lead of leads) {
    try {
      const created = await createLeadFollowupItem(client, lead);
      if (created) result.sent++;
      else result.skipped++;
    } catch (error) {
      result.errors++;
      logger.error("lead-followup: failed to create action item", error, { leadId: lead.id });
    }
  }

  await client.query(
    `UPDATE automations
        SET last_run_at = now(),
            next_run_at = now() + interval '1 hour',
            updated_at = now()
      WHERE id = $1`,
    [automation.id]
  );

  return result;
}

export async function runLeadFollowups(client: Client): Promise<ReminderResult[]> {
  const automations = await findDueLeadFollowups(client);
  const results: ReminderResult[] = [];

  for (const automation of automations) {
    try {
      results.push(await processLeadFollowups(client, automation));
    } catch (error) {
      logger.error("lead-followup: automation failed", error, { automationId: automation.id });
    }
  }

  return results;
}
