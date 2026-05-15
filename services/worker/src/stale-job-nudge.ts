import type { Client } from "pg";
import { logger } from "./logger.js";
import type { AutomationRow, ReminderResult } from "./visit-reminder.js";

/**
 * Stale Job Nudge Automation
 *
 * Internal-only alert: flags jobs that have been scheduled/in_progress without
 * any future scheduled visit for config.days_without_visit days (default 14).
 *
 * No customer email is sent. Records an audit_log entry per stale job so the
 * operations dashboard can surface them. Fires at most once per (job, week)
 * to avoid alert fatigue.
 */

interface StaleJob {
  id: string;
  account_id: string;
  client_id: string;
  title: string;
  status: string;
  last_visit_at: string | null;
  days_without_visit: number;
}

export async function findDueStaleJobNudges(client: Client): Promise<AutomationRow[]> {
  const { rows } = await client.query<AutomationRow>(
    `SELECT id, account_id, type, config, enabled, next_run_at::text
       FROM automations
      WHERE type = 'stale_job_nudge'
        AND enabled = true
        AND next_run_at <= now()`
  );
  return rows;
}

export async function findStaleJobs(
  client: Client,
  automation: AutomationRow
): Promise<StaleJob[]> {
  const days = (automation.config as { days_without_visit?: number }).days_without_visit ?? 14;

  const { rows } = await client.query<StaleJob>(
    `SELECT j.id, j.account_id, j.client_id, j.title, j.status,
            last_v.completed_at::text AS last_visit_at,
            COALESCE(
              EXTRACT(DAY FROM (now() - last_v.completed_at))::int,
              EXTRACT(DAY FROM (now() - j.updated_at))::int
            ) AS days_without_visit
       FROM jobs j
       LEFT JOIN LATERAL (
         SELECT completed_at FROM visits v
          WHERE v.job_id = j.id AND v.account_id = j.account_id
            AND v.completed_at IS NOT NULL
          ORDER BY v.completed_at DESC LIMIT 1
       ) last_v ON true
      WHERE j.account_id = $1
        AND j.status IN ('scheduled', 'in_progress')
        AND NOT EXISTS (
          SELECT 1 FROM visits v2
           WHERE v2.job_id = j.id AND v2.account_id = j.account_id
             AND v2.status = 'scheduled'
             AND v2.scheduled_start > now()
        )
        AND (
          (last_v.completed_at IS NOT NULL AND last_v.completed_at < now() - ($2 || ' days')::interval) OR
          (last_v.completed_at IS NULL     AND j.updated_at        < now() - ($2 || ' days')::interval)
        )
        AND NOT EXISTS (
          SELECT 1 FROM audit_log al
           WHERE al.entity_type = 'stale_job_nudge'
             AND al.entity_id = j.id
             AND al.account_id = j.account_id
             AND al.created_at > now() - interval '7 days'
        )
      ORDER BY j.updated_at ASC`,
    [automation.account_id, days]
  );

  return rows;
}

async function emitStaleJobNudge(
  client: Client,
  job: StaleJob,
  automationId: string
): Promise<boolean> {
  await client.query(
    `INSERT INTO audit_log
       (account_id, entity_type, entity_id, action, actor_id, old_value, new_value)
     VALUES ($1, 'stale_job_nudge', $2, 'insert', $3, NULL, $4)`,
    [
      job.account_id,
      job.id,
      automationId,
      JSON.stringify({
        automation_id: automationId,
        title: job.title,
        status: job.status,
        days_without_visit: job.days_without_visit,
        last_visit_at: job.last_visit_at,
        flagged_at: new Date().toISOString(),
      }),
    ]
  );
  return true;
}

async function processStaleJobs(client: Client, automation: AutomationRow): Promise<ReminderResult> {
  const result: ReminderResult = {
    automationId: automation.id,
    accountId: automation.account_id,
    sent: 0,
    skipped: 0,
    errors: 0,
  };

  const jobs = await findStaleJobs(client, automation);
  for (const job of jobs) {
    try {
      const emitted = await emitStaleJobNudge(client, job, automation.id);
      if (emitted) result.sent++;
      else result.skipped++;
    } catch (error) {
      result.errors++;
      logger.error("stale-job-nudge: failed to emit", error, { jobId: job.id });
    }
  }

  await client.query(
    `UPDATE automations
        SET last_run_at = now(),
            next_run_at = now() + interval '6 hours',
            updated_at = now()
      WHERE id = $1`,
    [automation.id]
  );

  return result;
}

export async function runStaleJobNudges(client: Client): Promise<ReminderResult[]> {
  const automations = await findDueStaleJobNudges(client);
  const results: ReminderResult[] = [];

  for (const automation of automations) {
    try {
      results.push(await processStaleJobs(client, automation));
    } catch (error) {
      logger.error("stale-job-nudge: automation failed", error, { automationId: automation.id });
    }
  }

  return results;
}
