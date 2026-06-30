import type { Client } from "pg";
import { logger } from "./logger.js";
import { appUrl } from "./mailer.js";
import type { AutomationRow, RunResult } from "./automations/types.js";
import { enqueueNotification } from "./notification/enqueue.js";
import { PRIORITY } from "./notification/priority.js";

/**
 * Lead Follow-Up Automation
 *
 * Emails the owner a nudge when a pending booking request has had no activity
 * for more than the configured threshold (default 24h). This is an internal
 * reminder to reconnect with the lead — no client email is sent.
 *
 * (Previously this wrote a `follow_up` action_item surfaced in the Inbox. The
 * Inbox surface was retired, so the nudge is now delivered as an owner email
 * via the notification queue. Pending leads also remain visible on the Requests
 * page and in the Action Queue.)
 *
 * Idempotent: each booking request gets at most one follow-up email, tracked by
 * an audit_log `lead_followup` entry. If the lead is no longer pending, it is
 * not selected.
 */

interface StaleLead {
  id: string;
  account_id: string;
  name: string;
  hours_pending: number;
  owner_email: string | null;
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
            EXTRACT(EPOCH FROM (now() - br.created_at)) / 3600 AS hours_pending,
            (SELECT u.email FROM users u
              WHERE u.account_id = br.account_id AND u.role = 'owner'
              ORDER BY u.created_at ASC LIMIT 1) AS owner_email
       FROM booking_requests br
      WHERE br.account_id = $1
        AND br.status = 'pending'
        AND br.created_at <= now() - ($2 || ' hours')::interval
        AND NOT EXISTS (
          SELECT 1 FROM audit_log al
           WHERE al.account_id = br.account_id
             AND al.entity_type = 'lead_followup'
             AND al.entity_id = br.id
        )
      ORDER BY br.created_at ASC
      LIMIT 50`,
    [automation.account_id, hoursThreshold]
  );

  return rows;
}

function leadFollowupHtml(lead: StaleLead): string {
  const hours = Math.round(lead.hours_pending);
  const reviewUrl = `${appUrl()}/app/requests`;
  return `
    <p>A new request from <strong>${lead.name}</strong> has been pending for ${hours}h with no action yet.</p>
    <p>Reach out to keep the lead warm, or update the request status.</p>
    <p><a href="${reviewUrl}">Review requests →</a></p>
  `;
}

async function emitLeadFollowup(
  client: Client,
  lead: StaleLead,
  automationId: string
): Promise<boolean> {
  // Idempotency guard — one follow-up per lead (mirrors the audit_log NOT EXISTS
  // in findStaleLeads so concurrent runs don't double-send).
  const { rowCount } = await client.query(
    `SELECT 1 FROM audit_log
      WHERE account_id = $1 AND entity_type = 'lead_followup' AND entity_id = $2
      LIMIT 1`,
    [lead.account_id, lead.id]
  );
  if (rowCount && rowCount > 0) return false;

  if (!lead.owner_email) {
    logger.warn("lead-followup: no owner email on file; skipping", { leadId: lead.id });
    return false;
  }

  const enqueueResult = await enqueueNotification(client, {
    accountId: lead.account_id,
    clientId: null, // owner-facing reminder — bypasses client cooldown/daily cap
    automationType: "lead_followup",
    priority: PRIORITY.HIGH,
    toAddress: lead.owner_email,
    subject: `Follow up with ${lead.name} — request pending ${Math.round(lead.hours_pending)}h`,
    htmlBody: leadFollowupHtml(lead),
    idempotencyKey: `lead_followup:${lead.id}`,
    entityType: "booking_request",
    entityId: lead.id,
    metadata: { automationId },
  });
  if (enqueueResult === "suppressed") {
    logger.debug("lead-followup: suppressed by governor", { leadId: lead.id });
    return false;
  }

  // Record the send so the lead is not re-selected on the next run.
  await client.query(
    `INSERT INTO audit_log
       (account_id, entity_type, entity_id, action, actor_id, old_value, new_value)
     VALUES ($1, 'lead_followup', $2, 'insert', $3, NULL, $4)`,
    [
      lead.account_id,
      lead.id,
      automationId,
      JSON.stringify({
        automation_id: automationId,
        lead_name: lead.name,
        hours_pending: Math.round(lead.hours_pending),
        queued_at: new Date().toISOString(),
      }),
    ]
  );
  return true;
}

export async function processLeadFollowups(client: Client, automation: AutomationRow): Promise<RunResult> {
  const result: RunResult = {
    automationId: automation.id,
    accountId: automation.account_id,
    sent: 0,
    skipped: 0,
    errors: 0,
  };

  const leads = await findStaleLeads(client, automation);
  for (const lead of leads) {
    try {
      const emitted = await emitLeadFollowup(client, lead, automation.id);
      if (emitted) result.sent++;
      else result.skipped++;
    } catch (error) {
      result.errors++;
      logger.error("lead-followup: failed to emit follow-up", error, { leadId: lead.id });
    }
  }

  return result;
}
