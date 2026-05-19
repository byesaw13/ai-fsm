import type { Client } from "pg";
import { PRIORITY, COOLDOWN_BYPASS_MINIMUM } from "./priority.js";

export interface EnqueueOpts {
  accountId: string;
  clientId: string | null;
  automationType: string;
  priority: number;
  toAddress: string;
  subject: string;
  htmlBody: string;
  idempotencyKey: string;
  entityType?: string;
  entityId?: string;
  cancelOnEvents?: string[];
  scheduledFor?: Date;
  metadata?: Record<string, unknown>;
}

export type EnqueueResult = "enqueued" | "duplicate" | "suppressed";

export async function enqueueNotification(
  client: Client,
  opts: EnqueueOpts
): Promise<EnqueueResult> {
  // Check idempotency — skip if any non-failed row exists for this key
  const existing = await client.query<{ status: string }>(
    `SELECT status FROM notification_queue WHERE idempotency_key = $1 LIMIT 1`,
    [opts.idempotencyKey]
  );
  if (existing.rows.length > 0 && existing.rows[0].status !== "failed") {
    return "duplicate";
  }

  // Check cooldown for non-critical notifications
  if (opts.priority > COOLDOWN_BYPASS_MINIMUM && opts.clientId) {
    const cooldown = await client.query<{ last_sent_at: string; cooldown_hours: number }>(
      `SELECT nc.last_sent_at,
              COALESCE(ar.cooldown_hours, 4) AS cooldown_hours
       FROM notification_cooldowns nc
       LEFT JOIN automation_settings ar ON ar.account_id = nc.account_id
       WHERE nc.account_id = $1 AND nc.client_id = $2`,
      [opts.accountId, opts.clientId]
    );
    if (cooldown.rows.length > 0) {
      const { last_sent_at, cooldown_hours } = cooldown.rows[0];
      const elapsed = (Date.now() - new Date(last_sent_at).getTime()) / 3_600_000;
      if (elapsed < cooldown_hours) {
        return "suppressed";
      }
    }
  }

  // Check daily cap for LOW priority
  if (opts.priority >= PRIORITY.LOW && opts.clientId) {
    const cap = await client.query<{ today_count: number; max_per_day: number }>(
      `SELECT
         COUNT(nq.id)::int                           AS today_count,
         COALESCE(ar.max_per_day, 2)                 AS max_per_day
       FROM notification_queue nq
       LEFT JOIN automation_settings ar ON ar.account_id = nq.account_id
       WHERE nq.account_id = $1
         AND nq.client_id  = $2
         AND nq.status     = 'sent'
         AND nq.sent_at    >= date_trunc('day', now() AT TIME ZONE COALESCE(ar.working_hours_tz, 'America/New_York'))
       GROUP BY ar.max_per_day`,
      [opts.accountId, opts.clientId]
    );
    if (cap.rows.length > 0 && cap.rows[0].today_count >= cap.rows[0].max_per_day) {
      return "suppressed";
    }
  }

  // Upsert: if a failed row exists for this key, reset it; otherwise insert fresh
  const nextAttemptAt = opts.scheduledFor ?? new Date();
  await client.query(
    `INSERT INTO notification_queue
       (account_id, client_id, automation_type, priority, to_address,
        subject, html_body, idempotency_key, entity_type, entity_id,
        cancel_on_events, next_attempt_at, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (idempotency_key) DO UPDATE
       SET status          = 'pending',
           attempt_count   = 0,
           failure_reason  = NULL,
           next_attempt_at = EXCLUDED.next_attempt_at`,
    [
      opts.accountId,
      opts.clientId,
      opts.automationType,
      opts.priority,
      opts.toAddress,
      opts.subject,
      opts.htmlBody,
      opts.idempotencyKey,
      opts.entityType ?? null,
      opts.entityId ?? null,
      opts.cancelOnEvents ?? [],
      nextAttemptAt.toISOString(),
      JSON.stringify(opts.metadata ?? {}),
    ]
  );

  return "enqueued";
}

export function cancelNotificationsForEntity(
  client: Client,
  entityType: string,
  entityId: string,
  eventType: string
): Promise<number> {
  return client.query(
    `UPDATE notification_queue
        SET status = 'cancelled'
      WHERE entity_type = $1
        AND entity_id   = $2::uuid
        AND status      = 'pending'
        AND $3 = ANY(cancel_on_events)`,
    [entityType, entityId, eventType]
  ).then((r) => r.rowCount ?? 0);
}
