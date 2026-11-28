/**
 * Dovetails Phone (TASK-260): SQL for the business phone's outbox and
 * check-ins. Called from the context-less /api/internal/phone/* routes and from
 * the SMS send switch, so account_id is always passed explicitly.
 */
import { query, queryOne } from "@/lib/db";

/** A claimed text not reported within this long is offered to the phone again. */
const OUTBOX_RECLAIM_MINUTES = 5;
/** A text not sent within this long is failed, not sent late. */
const OUTBOX_EXPIRE_MINUTES = 120;
/** Claims before a never-reported text is failed. */
const OUTBOX_MAX_ATTEMPTS = 3;

let ownerCache: { accountId: string; userId: string } | null = null;

/** The single owner account this deployment runs (cached for the process). */
export async function getOwnerContext(): Promise<{ accountId: string; userId: string }> {
  if (ownerCache) return ownerCache;
  const row = await queryOne<{ account_id: string; user_id: string }>(
    `SELECT a.id AS account_id, u.id AS user_id
     FROM accounts a JOIN users u ON u.account_id = a.id
     WHERE u.role = 'owner' ORDER BY u.created_at LIMIT 1`,
  );
  if (!row) throw new Error("No owner account found");
  ownerCache = { accountId: row.account_id, userId: row.user_id };
  return ownerCache;
}

export async function enqueuePhoneText(
  accountId: string,
  toPhone: string,
  body: string,
): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO phone_outbox (account_id, to_phone, body)
     VALUES ($1, $2, $3) RETURNING id`,
    [accountId, toPhone, body.slice(0, 1600)],
  );
  if (!row) throw new Error("phone outbox insert returned no row");
  return row.id;
}

/**
 * Fails texts that are too old or were claimed too many times without a
 * report. Returns their ids so the caller can mark the logged text failed.
 */
export async function expireStaleOutbox(accountId: string): Promise<string[]> {
  const rows = await query<{ id: string }>(
    `UPDATE phone_outbox
     SET status = 'failed',
         error = CASE
           WHEN created_at < now() - ($2::text || ' minutes')::interval
             THEN 'Not sent within ' || $2::text || ' minutes'
           ELSE 'Phone never reported the send'
         END
     WHERE account_id = $1
       AND status IN ('queued', 'claimed')
       AND (
         created_at < now() - ($2::text || ' minutes')::interval
         OR (status = 'claimed' AND attempts >= $3
             AND claimed_at < now() - ($4::text || ' minutes')::interval)
       )
     RETURNING id`,
    [accountId, String(OUTBOX_EXPIRE_MINUTES), OUTBOX_MAX_ATTEMPTS, String(OUTBOX_RECLAIM_MINUTES)],
  );
  return rows.map((r) => r.id);
}

/** Hands the phone the next texts to send, oldest first. */
export async function claimOutbox(
  accountId: string,
  deviceId: string,
  limit = 10,
): Promise<Array<{ id: string; to_phone: string; body: string }>> {
  return query<{ id: string; to_phone: string; body: string }>(
    `WITH next AS (
       SELECT id FROM phone_outbox
       WHERE account_id = $1
         AND (
           status = 'queued'
           OR (status = 'claimed' AND claimed_at < now() - ($4::text || ' minutes')::interval)
         )
       ORDER BY created_at
       LIMIT $2
       FOR UPDATE SKIP LOCKED
     )
     UPDATE phone_outbox o
     SET status = 'claimed', claimed_at = now(), claimed_by = $3, attempts = o.attempts + 1
     FROM next
     WHERE o.id = next.id
     RETURNING o.id, o.to_phone, o.body`,
    [accountId, Math.min(Math.max(limit, 1), 25), deviceId, String(OUTBOX_RECLAIM_MINUTES)],
  );
}

/**
 * Records what the phone did with one text. A delivered text stays delivered.
 * Returns false when the id is unknown or the report would move it backwards.
 */
export async function reportOutbox(
  accountId: string,
  id: string,
  status: "sent" | "delivered" | "failed",
  error: string | null,
): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `UPDATE phone_outbox
     SET status = $3,
         sent_at = CASE WHEN $3 IN ('sent', 'delivered') THEN COALESCE(sent_at, now()) ELSE sent_at END,
         delivered_at = CASE WHEN $3 = 'delivered' THEN now() ELSE delivered_at END,
         error = CASE WHEN $3 = 'failed' THEN $4 ELSE NULL END
     WHERE account_id = $1 AND id = $2 AND status <> 'delivered'
       AND NOT (status = 'sent' AND $3 = 'sent')
     RETURNING id`,
    [accountId, id, status, error?.slice(0, 500) ?? null],
  );
  return rows.length > 0;
}

/**
 * True when the phone sent this text for the server in the last day. The
 * phone's Sent folder also holds the texts the app sent, and those must not
 * be logged a second time as texts the owner typed.
 */
export async function wasSentFromOutbox(
  accountId: string,
  phoneLast10: string,
  body: string,
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM phone_outbox
     WHERE account_id = $1
       AND right(regexp_replace(to_phone, '\\D', '', 'g'), 10) = $2
       AND body = $3
       AND created_at > now() - interval '1 day'
     LIMIT 1`,
    [accountId, phoneLast10, body],
  );
  return row !== null;
}

export async function recordDeviceCheckIn(
  accountId: string,
  device: { deviceId: string; label?: string | null; appVersion?: string | null; status?: unknown },
): Promise<void> {
  await query(
    `INSERT INTO phone_devices (account_id, device_id, label, app_version, status, last_seen_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, now())
     ON CONFLICT (account_id, device_id) DO UPDATE
       SET label = COALESCE(EXCLUDED.label, phone_devices.label),
           app_version = COALESCE(EXCLUDED.app_version, phone_devices.app_version),
           status = EXCLUDED.status,
           last_seen_at = now()`,
    [
      accountId,
      device.deviceId,
      device.label ?? null,
      device.appVersion ?? null,
      JSON.stringify(device.status ?? {}),
    ],
  );
}

export async function phoneLastSeen(accountId: string): Promise<Date | null> {
  const row = await queryOne<{ last_seen_at: Date | string }>(
    `SELECT last_seen_at FROM phone_devices
     WHERE account_id = $1 ORDER BY last_seen_at DESC LIMIT 1`,
    [accountId],
  );
  if (!row) return null;
  const seen = new Date(row.last_seen_at);
  return Number.isNaN(seen.getTime()) ? null : seen;
}

export async function pendingOutboxCount(accountId: string): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM phone_outbox
     WHERE account_id = $1 AND status IN ('queued', 'claimed')`,
    [accountId],
  );
  return Number(row?.count ?? 0);
}
