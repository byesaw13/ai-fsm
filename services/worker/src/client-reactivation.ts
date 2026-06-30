import type { Client } from "pg";
import { logger } from "./logger.js";
import { clientReactivationHtml } from "@ai-fsm/email-templates";
import type { AutomationRow, ReminderResult } from "./visit-reminder.js";
import { enqueueNotification } from "./notification/enqueue.js";
import { PRIORITY } from "./notification/priority.js";

interface InactiveClient {
  id: string;
  account_id: string;
  name: string | null;
  email: string;
  months_since_last_job: number;
}

export async function findDueClientReactivations(client: Client): Promise<AutomationRow[]> {
  const { rows } = await client.query<AutomationRow>(
    `SELECT id, account_id, type, config, enabled, next_run_at::text
     FROM automations
     WHERE type = 'client_reactivation'
       AND enabled = true
       AND next_run_at <= now()`
  );
  return rows;
}

export async function findInactiveClients(
  client: Client,
  automation: AutomationRow
): Promise<InactiveClient[]> {
  const daysInactive = (automation.config as { days_inactive?: number }).days_inactive ?? 180;
  const year = new Date().getFullYear();

  const { rows } = await client.query<InactiveClient>(
    `SELECT c.id, c.account_id, c.name,
            c.email,
            EXTRACT(MONTH FROM (now() - MAX(j.updated_at)))::int AS months_since_last_job
     FROM clients c
     LEFT JOIN jobs j ON j.client_id = c.id AND j.account_id = c.account_id AND j.status = 'completed'
     WHERE c.account_id = $1
       AND c.email IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM audit_log al
         WHERE al.entity_type = 'client_reactivation'
           AND al.entity_id = c.id
           AND al.account_id = c.account_id
           AND (al.new_value->>'year')::int = $3
       )
     GROUP BY c.id, c.account_id, c.name, c.email
     HAVING MAX(j.updated_at) < now() - ($2 || ' days')::interval
         OR MAX(j.updated_at) IS NULL
     ORDER BY MAX(j.updated_at) ASC NULLS FIRST
     LIMIT 50`,
    [automation.account_id, daysInactive, year]
  );

  return rows;
}

async function emitClientReactivation(
  client: Client,
  inactive: InactiveClient,
  automationId: string
): Promise<boolean> {
  const year = new Date().getFullYear();

  const { rowCount } = await client.query(
    `SELECT 1 FROM audit_log
     WHERE entity_type = 'client_reactivation'
       AND entity_id = $1
       AND account_id = $2
       AND (new_value->>'year')::int = $3
     LIMIT 1`,
    [inactive.id, inactive.account_id, year]
  );
  if (rowCount && rowCount > 0) return false;

  if (inactive.name) {
    const months = Math.max(1, inactive.months_since_last_job);
    const enqueueResult = await enqueueNotification(client, {
      accountId: inactive.account_id,
      clientId: inactive.id,
      automationType: "client_reactivation",
      priority: PRIORITY.LOW,
      toAddress: inactive.email,
      subject: `We'd love to work with you again, ${inactive.name.split(" ")[0]}!`,
      htmlBody: clientReactivationHtml({
        clientName: inactive.name,
        monthsSinceLastService: months,
      }),
      idempotencyKey: `client_reactivation:${inactive.id}:${year}`,
      entityType: "client",
      entityId: inactive.id,
      metadata: { automationId, monthsSinceLastJob: months },
    });
    if (enqueueResult === "suppressed") {
      logger.debug("client-reactivation: suppressed by governor", { clientId: inactive.id });
      return false;
    }
  }

  await client.query(
    `INSERT INTO audit_log
       (account_id, entity_type, entity_id, action, actor_id, old_value, new_value)
     VALUES ($1, 'client_reactivation', $2, 'insert', $3, NULL, $4)`,
    [
      inactive.account_id,
      inactive.id,
      automationId,
      JSON.stringify({
        automation_id: automationId,
        client_name: inactive.name,
        months_since_last_job: inactive.months_since_last_job,
        year,
        queued_at: new Date().toISOString(),
      }),
    ]
  );
  return true;
}

async function processClientReactivation(
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

  const inactiveClients = await findInactiveClients(client, automation);
  for (const inactive of inactiveClients) {
    try {
      const emitted = await emitClientReactivation(client, inactive, automation.id);
      if (emitted) result.sent++;
      else result.skipped++;
    } catch (error) {
      result.errors++;
      logger.error("client-reactivation: failed to emit", error, { clientId: inactive.id });
    }
  }

  await client.query(
    `UPDATE automations
        SET last_run_at = now(),
            next_run_at = now() + interval '24 hours',
            updated_at = now()
      WHERE id = $1`,
    [automation.id]
  );

  return result;
}

export async function runClientReactivations(client: Client): Promise<ReminderResult[]> {
  const automations = await findDueClientReactivations(client);
  const results: ReminderResult[] = [];

  for (const automation of automations) {
    try {
      const result = await processClientReactivation(client, automation);
      results.push(result);
      logger.info("client-reactivation: processed", {
        automationId: automation.id,
        accountId: automation.account_id,
        sent: result.sent,
        skipped: result.skipped,
        errors: result.errors,
      });
    } catch (error) {
      logger.error("client-reactivation: automation failed", error, { automationId: automation.id });
    }
  }

  return results;
}
