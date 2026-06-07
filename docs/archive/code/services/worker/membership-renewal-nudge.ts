import type { Client } from "pg";
import { logger } from "./logger.js";
import { membershipRenewalNudgeHtml } from "./mailer.js";
import type { AutomationRow, ReminderResult } from "./visit-reminder.js";
import { enqueueNotification } from "./notification/enqueue.js";
import { PRIORITY } from "./notification/priority.js";

/**
 * Membership Renewal Nudge Automation
 *
 * Sends a heads-up email to clients whose maintenance plan renews within
 * config.days_before_renewal days (default 30).
 *
 * Eligible when:
 *  - maintenance plan status='active'
 *  - renewal_date IS NOT NULL
 *  - renewal_date is between (now + days) and (now + days - 1d) — fires once at the threshold
 *  - client has an email
 *  - no prior 'membership_renewal_nudge' audit entry for this plan within the renewal window
 */

interface EligiblePlan {
  id: string;
  account_id: string;
  client_id: string;
  name: string;
  renewal_date: string;
  days_until_renewal: number;
  client_name: string | null;
  client_email: string | null;
}

export async function findDueRenewalNudges(client: Client): Promise<AutomationRow[]> {
  const { rows } = await client.query<AutomationRow>(
    `SELECT id, account_id, type, config, enabled, next_run_at::text
       FROM automations
      WHERE type = 'membership_renewal_nudge'
        AND enabled = true
        AND next_run_at <= now()`
  );
  return rows;
}

export async function findEligiblePlans(
  client: Client,
  automation: AutomationRow
): Promise<EligiblePlan[]> {
  const daysBefore = (automation.config as { days_before_renewal?: number }).days_before_renewal ?? 30;

  const { rows } = await client.query<EligiblePlan>(
    `SELECT p.id, p.account_id, c.id AS client_id, p.name,
            p.renewal_date::text AS renewal_date,
            (p.renewal_date - CURRENT_DATE)::int AS days_until_renewal,
            c.name AS client_name, c.email AS client_email
       FROM maintenance_plans p
       JOIN clients c ON c.id = p.client_id AND c.account_id = p.account_id
      WHERE p.account_id = $1
        AND p.status = 'active'
        AND p.renewal_date IS NOT NULL
        AND p.renewal_date <= CURRENT_DATE + ($2 || ' days')::interval
        AND p.renewal_date >  CURRENT_DATE + ($2 || ' days')::interval - interval '1 day'
        AND c.email IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM audit_log al
           WHERE al.entity_type = 'membership_renewal_nudge'
             AND al.entity_id = p.id
             AND al.account_id = p.account_id
             AND (al.new_value->>'renewal_date')::date = p.renewal_date
        )
      ORDER BY p.renewal_date ASC`,
    [automation.account_id, daysBefore]
  );

  return rows;
}

async function emitRenewalNudge(
  client: Client,
  plan: EligiblePlan,
  automationId: string
): Promise<boolean> {
  const { rowCount } = await client.query(
    `SELECT 1 FROM audit_log
      WHERE entity_type = 'membership_renewal_nudge'
        AND entity_id = $1
        AND account_id = $2
        AND (new_value->>'renewal_date')::date = $3::date
      LIMIT 1`,
    [plan.id, plan.account_id, plan.renewal_date]
  );
  if (rowCount && rowCount > 0) return false;

  if (plan.client_email && plan.client_name) {
    const enqueueResult = await enqueueNotification(client, {
      accountId: plan.account_id,
      clientId: plan.client_id,
      automationType: "membership_renewal_nudge",
      priority: PRIORITY.MEDIUM,
      toAddress: plan.client_email,
      subject: `Your ${plan.name} renews in ${plan.days_until_renewal} days`,
      htmlBody: membershipRenewalNudgeHtml({
        clientName: plan.client_name,
        planName: plan.name,
        renewsOn: plan.renewal_date,
        daysUntilRenewal: plan.days_until_renewal,
      }),
      idempotencyKey: `membership_renewal_nudge:${plan.id}:${plan.renewal_date}`,
      entityType: "maintenance_plan",
      entityId: plan.id,
      cancelOnEvents: ["membership.cancelled"],
      metadata: { automationId },
    });
    if (enqueueResult === "suppressed") {
      logger.debug("membership-renewal-nudge: suppressed by governor", { planId: plan.id });
      return false;
    }
  }

  await client.query(
    `INSERT INTO audit_log
       (account_id, entity_type, entity_id, action, actor_id, old_value, new_value)
     VALUES ($1, 'membership_renewal_nudge', $2, 'insert', $3, NULL, $4)`,
    [
      plan.account_id,
      plan.id,
      automationId,
      JSON.stringify({
        automation_id: automationId,
        plan_name: plan.name,
        client_name: plan.client_name,
        renewal_date: plan.renewal_date,
        queued_at: new Date().toISOString(),
      }),
    ]
  );
  return true;
}

async function processRenewalNudges(client: Client, automation: AutomationRow): Promise<ReminderResult> {
  const result: ReminderResult = {
    automationId: automation.id,
    accountId: automation.account_id,
    sent: 0,
    skipped: 0,
    errors: 0,
  };

  const plans = await findEligiblePlans(client, automation);
  for (const plan of plans) {
    try {
      const emitted = await emitRenewalNudge(client, plan, automation.id);
      if (emitted) result.sent++;
      else result.skipped++;
    } catch (error) {
      result.errors++;
      logger.error("membership-renewal-nudge: failed to emit", error, { planId: plan.id });
    }
  }

  await client.query(
    `UPDATE automations
        SET last_run_at = now(),
            next_run_at = now() + interval '12 hours',
            updated_at = now()
      WHERE id = $1`,
    [automation.id]
  );

  return result;
}

export async function runRenewalNudges(client: Client): Promise<ReminderResult[]> {
  const automations = await findDueRenewalNudges(client);
  const results: ReminderResult[] = [];

  for (const automation of automations) {
    try {
      results.push(await processRenewalNudges(client, automation));
    } catch (error) {
      logger.error("membership-renewal-nudge: automation failed", error, { automationId: automation.id });
    }
  }

  return results;
}
