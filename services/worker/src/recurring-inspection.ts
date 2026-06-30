import type { Client } from "pg";
import { logger } from "./logger.js";
import { recurringInspectionHtml } from "@ai-fsm/email-templates";
import type { AutomationRow, RunResult } from "./automations/types.js";
import { enqueueNotification } from "./notification/enqueue.js";
import { PRIORITY } from "./notification/priority.js";

interface InspectionDuePlan {
  id: string;
  account_id: string;
  client_id: string;
  name: string;
  client_name: string | null;
  client_email: string | null;
  property_address: string | null;
  days_since_last_inspection: number;
}

export async function findDueRecurringInspections(client: Client): Promise<AutomationRow[]> {
  const { rows } = await client.query<AutomationRow>(
    `SELECT id, account_id, type, config, enabled, next_run_at::text
     FROM automations
     WHERE type = 'recurring_inspection'
       AND enabled = true
       AND next_run_at <= now()`
  );
  return rows;
}

export async function findPlansNeedingInspection(
  client: Client,
  automation: AutomationRow
): Promise<InspectionDuePlan[]> {
  const inspectionIntervalDays = (automation.config as { interval_days?: number }).interval_days ?? 365;

  const { rows } = await client.query<InspectionDuePlan>(
    `SELECT
       mp.id, mp.account_id, c.id AS client_id, mp.name,
       c.name AS client_name, c.email AS client_email,
       p.address AS property_address,
       EXTRACT(DAY FROM (now() - COALESCE(
         (SELECT MAX(v.completed_at)
          FROM visits v
          JOIN jobs j ON j.id = v.job_id
          WHERE j.client_id = c.id
            AND j.account_id = mp.account_id
            AND v.status = 'completed'
            AND v.generated_from_plan_id = mp.id),
         mp.created_at
       )))::int AS days_since_last_inspection
     FROM maintenance_plans mp
     JOIN clients c ON c.id = mp.client_id AND c.account_id = mp.account_id
     LEFT JOIN properties p ON p.client_id = c.id AND p.account_id = mp.account_id
     WHERE mp.account_id = $1
       AND mp.status = 'active'
       AND c.email IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM audit_log al
         WHERE al.entity_type = 'recurring_inspection'
           AND al.entity_id = mp.id
           AND al.account_id = mp.account_id
           AND al.created_at > now() - ($2::text || ' days')::interval
       )
       AND EXTRACT(DAY FROM (now() - COALESCE(
         (SELECT MAX(v2.completed_at)
          FROM visits v2
          JOIN jobs j2 ON j2.id = v2.job_id
          WHERE j2.client_id = c.id
            AND j2.account_id = mp.account_id
            AND v2.status = 'completed'
            AND v2.generated_from_plan_id = mp.id),
         mp.created_at
       ))) >= $2::int
     ORDER BY days_since_last_inspection DESC
     LIMIT 50`,
    [automation.account_id, inspectionIntervalDays]
  );

  return rows;
}

async function emitRecurringInspection(
  client: Client,
  plan: InspectionDuePlan,
  automationId: string,
  intervalDays: number
): Promise<boolean> {
  const { rowCount } = await client.query(
    `SELECT 1 FROM audit_log
     WHERE entity_type = 'recurring_inspection'
       AND entity_id = $1
       AND account_id = $2
       AND created_at > now() - ($3 || ' days')::interval
     LIMIT 1`,
    [plan.id, plan.account_id, intervalDays]
  );
  if (rowCount && rowCount > 0) return false;

  if (plan.client_name && plan.client_email) {
    const enqueueResult = await enqueueNotification(client, {
      accountId: plan.account_id,
      clientId: plan.client_id,
      automationType: "recurring_inspection",
      priority: PRIORITY.MEDIUM,
      toAddress: plan.client_email,
      subject: `Time for your annual inspection — ${plan.name}`,
      htmlBody: recurringInspectionHtml({
        clientName: plan.client_name,
        planName: plan.name,
        propertyAddress: plan.property_address,
      }),
      idempotencyKey: `recurring_inspection:${plan.id}:${new Date().getFullYear()}`,
      entityType: "maintenance_plan",
      entityId: plan.id,
      cancelOnEvents: ["membership.cancelled"],
      metadata: { automationId, daysSinceLastInspection: plan.days_since_last_inspection },
    });
    if (enqueueResult === "suppressed") {
      logger.debug("recurring-inspection: suppressed by governor", { planId: plan.id });
      return false;
    }
  }

  await client.query(
    `INSERT INTO audit_log
       (account_id, entity_type, entity_id, action, actor_id, old_value, new_value)
     VALUES ($1, 'recurring_inspection', $2, 'insert', $3, NULL, $4)`,
    [
      plan.account_id,
      plan.id,
      automationId,
      JSON.stringify({
        automation_id: automationId,
        plan_name: plan.name,
        client_name: plan.client_name,
        days_since_last_inspection: plan.days_since_last_inspection,
        queued_at: new Date().toISOString(),
      }),
    ]
  );
  return true;
}

export async function processRecurringInspections(
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

  const intervalDays = (automation.config as { interval_days?: number }).interval_days ?? 365;
  const plans = await findPlansNeedingInspection(client, automation);

  for (const plan of plans) {
    try {
      const emitted = await emitRecurringInspection(client, plan, automation.id, intervalDays);
      if (emitted) result.sent++;
      else result.skipped++;
    } catch (error) {
      result.errors++;
      logger.error("recurring-inspection: failed to emit", error, { planId: plan.id });
    }
  }

  return result;
}
