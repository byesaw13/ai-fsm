import type { Client } from "pg";
import { logger } from "./logger.js";
import { seasonalReminderHtml } from "./mailer.js";
import type { AutomationRow, ReminderResult } from "./visit-reminder.js";
import { enqueueNotification } from "./notification/enqueue.js";
import { PRIORITY } from "./notification/priority.js";

type Season = "spring" | "fall";

interface SeasonalClient {
  id: string;
  account_id: string;
  name: string | null;
  email: string;
}

function getCurrentSeason(automationType: string): Season {
  return automationType.includes("spring") ? "spring" : "fall";
}

async function findDueSeasonalRemindersForType(
  client: Client,
  type: string
): Promise<AutomationRow[]> {
  const { rows } = await client.query<AutomationRow>(
    `SELECT id, account_id, type, config, enabled, next_run_at::text
     FROM automations
     WHERE type = $1
       AND enabled = true
       AND next_run_at <= now()`,
    [type]
  );
  return rows;
}

async function findEligibleSeasonalClients(
  client: Client,
  automation: AutomationRow
): Promise<SeasonalClient[]> {
  const year = new Date().getFullYear();
  const auditEntityType = automation.type; // 'seasonal_reminder_spring' or 'seasonal_reminder_fall'

  const { rows } = await client.query<SeasonalClient>(
    `SELECT c.id, c.account_id, c.name, c.email
     FROM clients c
     WHERE c.account_id = $1
       AND c.email IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM audit_log al
         WHERE al.entity_type = $2
           AND al.entity_id = c.id
           AND al.account_id = c.account_id
           AND (al.new_value->>'year')::int = $3
       )
     ORDER BY c.name ASC
     LIMIT 100`,
    [automation.account_id, auditEntityType, year]
  );

  return rows;
}

async function emitSeasonalReminder(
  client: Client,
  seasonClient: SeasonalClient,
  automation: AutomationRow
): Promise<boolean> {
  const year = new Date().getFullYear();
  const season = getCurrentSeason(automation.type);

  const { rowCount } = await client.query(
    `SELECT 1 FROM audit_log
     WHERE entity_type = $1
       AND entity_id = $2
       AND account_id = $3
       AND (new_value->>'year')::int = $4
     LIMIT 1`,
    [automation.type, seasonClient.id, seasonClient.account_id, year]
  );
  if (rowCount && rowCount > 0) return false;

  if (seasonClient.name) {
    const enqueueResult = await enqueueNotification(client, {
      accountId: seasonClient.account_id,
      clientId: seasonClient.id,
      automationType: automation.type,
      priority: PRIORITY.LOW,
      toAddress: seasonClient.email,
      subject: season === "spring"
        ? "Spring Home Maintenance — We're Booking Now"
        : "Get Your Home Ready for Fall — Book Now",
      htmlBody: seasonalReminderHtml({
        clientName: seasonClient.name,
        season,
      }),
      idempotencyKey: `${automation.type}:${seasonClient.id}:${year}`,
      entityType: "client",
      entityId: seasonClient.id,
      metadata: { automationId: automation.id, season, year },
    });
    if (enqueueResult === "suppressed") {
      logger.debug("seasonal-reminder: suppressed by governor", { clientId: seasonClient.id, season });
      return false;
    }
  }

  await client.query(
    `INSERT INTO audit_log
       (account_id, entity_type, entity_id, action, actor_id, old_value, new_value)
     VALUES ($1, $2, $3, 'insert', $4, NULL, $5)`,
    [
      seasonClient.account_id,
      automation.type,
      seasonClient.id,
      automation.id,
      JSON.stringify({
        automation_id: automation.id,
        client_name: seasonClient.name,
        season,
        year,
        queued_at: new Date().toISOString(),
      }),
    ]
  );
  return true;
}

async function processSeasonalReminders(
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

  const clients = await findEligibleSeasonalClients(client, automation);
  for (const c of clients) {
    try {
      const emitted = await emitSeasonalReminder(client, c, automation);
      if (emitted) result.sent++;
      else result.skipped++;
    } catch (error) {
      result.errors++;
      logger.error("seasonal-reminder: failed to emit", error, { clientId: c.id });
    }
  }

  // Run again in 7 days (handles batching if > 100 clients)
  await client.query(
    `UPDATE automations
        SET last_run_at = now(),
            next_run_at = now() + interval '7 days',
            updated_at = now()
      WHERE id = $1`,
    [automation.id]
  );

  return result;
}

export async function runSeasonalReminders(client: Client): Promise<ReminderResult[]> {
  const [springAutomations, fallAutomations] = await Promise.all([
    findDueSeasonalRemindersForType(client, "seasonal_reminder_spring"),
    findDueSeasonalRemindersForType(client, "seasonal_reminder_fall"),
  ]);

  const automations = [...springAutomations, ...fallAutomations];
  const results: ReminderResult[] = [];

  for (const automation of automations) {
    try {
      const result = await processSeasonalReminders(client, automation);
      results.push(result);
      logger.info("seasonal-reminder: processed", {
        automationId: automation.id,
        type: automation.type,
        accountId: automation.account_id,
        sent: result.sent,
        skipped: result.skipped,
        errors: result.errors,
      });
    } catch (error) {
      logger.error("seasonal-reminder: automation failed", error, { automationId: automation.id });
    }
  }

  return results;
}
