import type { Client } from "pg";
import { logger } from "./logger.js";
import { seasonalReminderHtml } from "@ai-fsm/email-templates";
import type { AutomationRow, RunResult } from "./automations/types.js";
import { enqueueNotification } from "./notification/enqueue.js";
import { PRIORITY } from "./notification/priority.js";

type Season = "spring" | "fall";

// Spring: March–May (months 3–5), Fall: September–November (months 9–11)
const SEASON_MONTHS: Record<Season, number[]> = {
  spring: [3, 4, 5],
  fall: [9, 10, 11],
};

interface SeasonalClient {
  id: string;
  account_id: string;
  name: string | null;
  email: string;
}

export function getCurrentSeason(automationType: string): Season {
  return automationType.includes("spring") ? "spring" : "fall";
}

export function isInSeason(season: Season): boolean {
  const month = new Date().getMonth() + 1; // 1-12
  return SEASON_MONTHS[season].includes(month);
}

export function nextSeasonStartDate(season: Season): Date {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const startMonth = SEASON_MONTHS[season][0]; // first month of season
  const year = currentMonth > startMonth ? now.getFullYear() + 1 : now.getFullYear();
  return new Date(Date.UTC(year, startMonth - 1, 1, 0, 0, 0));
}

export async function findDueSeasonalSpring(client: Client): Promise<AutomationRow[]> {
  return findDueSeasonalRemindersForType(client, "seasonal_reminder_spring");
}

export async function findDueSeasonalFall(client: Client): Promise<AutomationRow[]> {
  return findDueSeasonalRemindersForType(client, "seasonal_reminder_fall");
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

export async function processSeasonalReminder(
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

  const season = getCurrentSeason(automation.type);

  // Only run during the appropriate calendar months — gate prevents out-of-season
  // sends when the automation fires immediately after seeding or re-enabling.
  // Runner owns next_run_at advancement via advanceSeasonalNextRun.
  if (!isInSeason(season)) {
    logger.info("seasonal-reminder: out of season, skipping client dispatch", {
      automationId: automation.id,
      season,
    });
    return result;
  }

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

  return result;
}
