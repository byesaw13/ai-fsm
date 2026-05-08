import type { Client } from "pg";
import { logger } from "./logger.js";
import { sendEmail, isEmailConfigured, reviewRequestHtml } from "./mailer.js";
import type { AutomationRow, ReminderResult } from "./visit-reminder.js";

/**
 * Review Request Automation
 *
 * After a job is completed, sends the client a "How did we do?" email to
 * solicit a review. Fires once per job — idempotency via audit_log.
 *
 * A job is eligible if:
 * 1. Job status is 'completed'
 * 2. completed_at is between (now - days_after - 1 day) and (now - days_after)
 *    — defaults to 1 day after completion (configurable via config.days_after)
 * 3. No 'review_request' audit entry exists for this job yet
 * 4. The client has an email address
 */

interface EligibleJob {
  id: string;
  account_id: string;
  title: string | null;
  client_name: string | null;
  client_email: string | null;
  tech_name: string | null;
}

export async function findDueReviewRequests(client: Client): Promise<AutomationRow[]> {
  const { rows } = await client.query<AutomationRow>(
    `SELECT id, account_id, type, config, enabled, next_run_at::text
     FROM automations
     WHERE type = 'review_request'
       AND enabled = true
       AND next_run_at <= now()`
  );
  return rows;
}

export async function findEligibleJobs(
  client: Client,
  automation: AutomationRow
): Promise<EligibleJob[]> {
  const daysAfter = (automation.config as { days_after?: number }).days_after ?? 1;

  const { rows } = await client.query<EligibleJob>(
    `SELECT j.id, j.account_id, j.title,
            c.name AS client_name, c.email AS client_email,
            u.full_name AS tech_name
     FROM jobs j
     JOIN clients c ON c.id = j.client_id
     LEFT JOIN (
       SELECT DISTINCT ON (v.job_id) v.job_id, u2.full_name
       FROM visits v
       JOIN users u2 ON u2.id = v.assigned_user_id
       WHERE v.account_id = $1
       ORDER BY v.job_id, v.completed_at DESC NULLS LAST
     ) recent_tech ON recent_tech.job_id = j.id
     LEFT JOIN users u ON u.full_name = recent_tech.full_name
     WHERE j.account_id = $1
       AND j.status = 'completed'
       AND j.updated_at >= now() - ($2 || ' days')::interval - interval '1 day'
       AND j.updated_at < now() - ($2 || ' days')::interval
       AND c.email IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM audit_log al
         WHERE al.entity_type = 'review_request'
           AND al.entity_id = j.id
           AND al.account_id = j.account_id
       )
     ORDER BY j.updated_at ASC`,
    [automation.account_id, daysAfter]
  );

  return rows;
}

async function emitReviewRequest(
  client: Client,
  job: EligibleJob,
  automationId: string
): Promise<boolean> {
  const { rowCount } = await client.query(
    `SELECT 1 FROM audit_log
     WHERE entity_type = 'review_request'
       AND entity_id = $1
       AND account_id = $2
     LIMIT 1`,
    [job.id, job.account_id]
  );

  if (rowCount && rowCount > 0) {
    return false;
  }

  if (isEmailConfigured() && job.client_email && job.client_name && job.title) {
    const emailResult = await sendEmail({
      to: job.client_email,
      subject: `How did we do? — ${job.title}`,
      html: reviewRequestHtml({
        clientName: job.client_name,
        jobTitle: job.title,
        techName: job.tech_name,
      }),
    });
    if (!emailResult.ok) {
      logger.warn("review-request: email send failed", { jobId: job.id, error: emailResult.error });
      return false;
    }
  }

  await client.query(
    `INSERT INTO audit_log
       (account_id, entity_type, entity_id, action, actor_id, old_value, new_value)
     VALUES ($1, 'review_request', $2, 'insert', $3, NULL, $4)`,
    [
      job.account_id,
      job.id,
      automationId,
      JSON.stringify({
        automation_id: automationId,
        job_title: job.title,
        client_name: job.client_name,
        sent_at: new Date().toISOString(),
      }),
    ]
  );

  return true;
}

async function processReviewRequests(
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

  const jobs = await findEligibleJobs(client, automation);

  for (const job of jobs) {
    try {
      const emitted = await emitReviewRequest(client, job, automation.id);
      if (emitted) {
        result.sent++;
      } else {
        result.skipped++;
      }
    } catch (error) {
      result.errors++;
      logger.error("review-request: failed to emit", error, { jobId: job.id });
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

export async function runReviewRequests(client: Client): Promise<ReminderResult[]> {
  const automations = await findDueReviewRequests(client);
  const results: ReminderResult[] = [];

  for (const automation of automations) {
    try {
      const result = await processReviewRequests(client, automation);
      results.push(result);
      logger.info("review-request: processed", {
        automationId: automation.id,
        accountId: automation.account_id,
        sent: result.sent,
        skipped: result.skipped,
        errors: result.errors,
      });
    } catch (error) {
      logger.error("review-request: failed to process automation", error, { automationId: automation.id });
    }
  }

  return results;
}
