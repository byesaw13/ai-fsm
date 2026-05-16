import type { Client } from "pg";
import { sendEmail } from "../mailer.js";
import { logger } from "../logger.js";
import { getRules, checkGovernor, updateCooldown } from "./governor.js";

interface QueueRow {
  id: string;
  account_id: string;
  client_id: string | null;
  automation_type: string;
  priority: number;
  to_address: string;
  subject: string;
  html_body: string;
  idempotency_key: string;
  attempt_count: number;
  max_attempts: number;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
}

export interface DispatchResult {
  sent: number;
  failed: number;
  retried: number;
  delayed: number;
  cancelled: number;
}

// Exponential backoff delays in milliseconds
const BACKOFF_MS = [0, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 6 * 3_600_000];

function nextAttemptAt(attemptCount: number): Date {
  const delayMs = BACKOFF_MS[Math.min(attemptCount, BACKOFF_MS.length - 1)];
  return new Date(Date.now() + delayMs);
}

export async function dispatchNotificationQueue(client: Client): Promise<DispatchResult> {
  const result: DispatchResult = { sent: 0, failed: 0, retried: 0, delayed: 0, cancelled: 0 };

  // Pick up to 20 pending items ordered by priority then scheduled time
  // SKIP LOCKED ensures future concurrency safety
  const { rows } = await client.query<QueueRow>(
    `SELECT id, account_id, client_id, automation_type, priority, to_address,
            subject, html_body, idempotency_key, attempt_count, max_attempts,
            entity_type, entity_id, metadata
     FROM notification_queue
     WHERE status = 'pending'
       AND next_attempt_at <= now()
     ORDER BY priority ASC, next_attempt_at ASC
     LIMIT 20
     FOR UPDATE SKIP LOCKED`
  );

  if (rows.length === 0) return result;

  // Cache rules per account to avoid repeated lookups
  const rulesCache = new Map<string, Awaited<ReturnType<typeof getRules>>>();

  for (const row of rows) {
    try {
      // Get or cache account rules
      if (!rulesCache.has(row.account_id)) {
        rulesCache.set(row.account_id, await getRules(client, row.account_id));
      }
      const rules = rulesCache.get(row.account_id)!;

      // Governor check
      const gov = await checkGovernor(client, row, rules);
      if (!gov.ok) {
        const delayTo = gov.delayUntil ?? new Date(Date.now() + 3_600_000);
        await client.query(
          `UPDATE notification_queue SET next_attempt_at = $1 WHERE id = $2`,
          [delayTo.toISOString(), row.id]
        );
        result.delayed++;
        continue;
      }

      // Mark as in-flight (increment attempt_count)
      await client.query(
        `UPDATE notification_queue SET attempt_count = attempt_count + 1 WHERE id = $1`,
        [row.id]
      );

      // Send
      const sendResult = await sendEmail({
        to: row.to_address,
        subject: row.subject,
        html: row.html_body,
      });

      if (sendResult.ok) {
        await client.query(
          `UPDATE notification_queue SET status = 'sent', sent_at = now() WHERE id = $1`,
          [row.id]
        );

        // Update cooldown
        if (row.client_id) {
          await updateCooldown(client, row.account_id, row.client_id);
        }

        // Log to communications_log
        if (row.client_id) {
          await client.query(
            `INSERT INTO communications_log
               (account_id, client_id, channel, direction, outcome, body_preview, external_id)
             VALUES ($1, $2, 'email', 'outbound', 'sent', $3, $4)`,
            [
              row.account_id,
              row.client_id,
              `${row.automation_type}: ${row.subject}`.slice(0, 200),
              row.id,
            ]
          );
        }

        result.sent++;
        logger.info("notification dispatched", {
          type: row.automation_type,
          to: row.to_address,
          idempotencyKey: row.idempotency_key,
        });
      } else {
        const newAttemptCount = row.attempt_count + 1;
        if (newAttemptCount >= row.max_attempts) {
          await client.query(
            `UPDATE notification_queue
                SET status = 'failed', failed_at = now(), failure_reason = $1
              WHERE id = $2`,
            [sendResult.error ?? "unknown", row.id]
          );
          result.failed++;
          logger.error("notification permanently failed", sendResult.error, {
            type: row.automation_type,
            attempts: newAttemptCount,
          });
        } else {
          const retryAt = nextAttemptAt(newAttemptCount);
          await client.query(
            `UPDATE notification_queue
                SET failure_reason = $1, next_attempt_at = $2
              WHERE id = $3`,
            [sendResult.error ?? "unknown", retryAt.toISOString(), row.id]
          );
          result.retried++;
        }
      }
    } catch (err) {
      logger.error("dispatch loop error", err, { notificationId: row.id });
      result.failed++;
    }
  }

  return result;
}
