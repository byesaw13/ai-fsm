import type { Client } from "pg";
import { logger } from "../logger.js";
import {
  getCurrentSeason,
  isInSeason,
  nextSeasonStartDate,
} from "../seasonal-reminder.js";
import type { AutomationRow, RunResult } from "./types.js";

export async function advanceVisitReminderNextRun(
  client: Client,
  automation: AutomationRow,
  _result: RunResult
): Promise<void> {
  await client.query(
    `UPDATE automations
     SET last_run_at = now(),
         next_run_at = now() + interval '1 hour',
         updated_at = now()
     WHERE id = $1`,
    [automation.id]
  );
}

export async function advanceInvoiceFollowupNextRun(
  client: Client,
  automation: AutomationRow,
  _result: RunResult
): Promise<void> {
  await client.query(
    `UPDATE automations
     SET last_run_at = now(),
         next_run_at = now() + interval '1 hour',
         updated_at = now()
     WHERE id = $1`,
    [automation.id]
  );
}

export async function advanceLeadFollowupNextRun(
  client: Client,
  automation: AutomationRow,
  _result: RunResult
): Promise<void> {
  await client.query(
    `UPDATE automations
        SET last_run_at = now(),
            next_run_at = now() + interval '1 hour',
            updated_at = now()
      WHERE id = $1`,
    [automation.id]
  );
}

export async function advanceReviewRequestNextRun(
  client: Client,
  automation: AutomationRow,
  _result: RunResult
): Promise<void> {
  await client.query(
    `UPDATE automations
     SET last_run_at = now(),
         next_run_at = now() + interval '1 hour',
         updated_at = now()
     WHERE id = $1`,
    [automation.id]
  );
}

export async function advanceBookingConfirmedNextRun(
  client: Client,
  automation: AutomationRow,
  _result: RunResult
): Promise<void> {
  await client.query(
    `UPDATE automations
     SET last_run_at = now(),
         next_run_at = now() + interval '30 minutes',
         updated_at = now()
     WHERE id = $1`,
    [automation.id]
  );
}

export async function advanceEstimateFollowupNextRun(
  client: Client,
  automation: AutomationRow,
  _result: RunResult
): Promise<void> {
  await client.query(
    `UPDATE automations
        SET last_run_at = now(),
            next_run_at = now() + interval '4 hours',
            updated_at = now()
      WHERE id = $1`,
    [automation.id]
  );
}

export async function advanceStaleJobNudgeNextRun(
  client: Client,
  automation: AutomationRow,
  _result: RunResult
): Promise<void> {
  await client.query(
    `UPDATE automations
        SET last_run_at = now(),
            next_run_at = now() + interval '6 hours',
            updated_at = now()
      WHERE id = $1`,
    [automation.id]
  );
}

export async function advancePropertyIssueScanNextRun(
  client: Client,
  automation: AutomationRow,
  _result: RunResult
): Promise<void> {
  await client.query(
    `UPDATE automations
        SET last_run_at = now(),
            next_run_at = now() + interval '24 hours',
            updated_at  = now()
      WHERE id = $1`,
    [automation.id]
  );
}

export async function advanceClientReactivationNextRun(
  client: Client,
  automation: AutomationRow,
  _result: RunResult
): Promise<void> {
  await client.query(
    `UPDATE automations
        SET last_run_at = now(),
            next_run_at = now() + interval '24 hours',
            updated_at = now()
      WHERE id = $1`,
    [automation.id]
  );
}

export async function advanceRecurringInspectionNextRun(
  client: Client,
  automation: AutomationRow,
  _result: RunResult
): Promise<void> {
  await client.query(
    `UPDATE automations
        SET last_run_at = now(),
            next_run_at = now() + interval '24 hours',
            updated_at = now()
      WHERE id = $1`,
    [automation.id]
  );
}

export async function advanceSeasonalNextRun(
  client: Client,
  automation: AutomationRow,
  _result: RunResult
): Promise<void> {
  const season = getCurrentSeason(automation.type);

  if (!isInSeason(season)) {
    const nextStart = nextSeasonStartDate(season);
    await client.query(
      `UPDATE automations
          SET last_run_at = now(), next_run_at = $1, updated_at = now()
        WHERE id = $2`,
      [nextStart.toISOString(), automation.id]
    );
    logger.info("seasonal-reminder: out of season, advancing next_run_at", {
      automationId: automation.id,
      season,
      nextStart,
    });
    return;
  }

  await client.query(
    `UPDATE automations
        SET last_run_at = now(),
            next_run_at = now() + interval '7 days',
            updated_at = now()
      WHERE id = $1`,
    [automation.id]
  );
}