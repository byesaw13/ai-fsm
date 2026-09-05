/**
 * push_subscriptions persistence (EPIC-005 TASK-118). Run under a client whose
 * RLS session is set (withDbSession) for the authed subscribe/unsubscribe
 * routes, or a pool client for internal sends.
 */
import type { PoolClient } from "pg";

export interface PushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface WebPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Upsert a subscription for a user. Re-subscribing the same endpoint refreshes it. */
export async function saveSubscription(
  client: PoolClient,
  accountId: string,
  userId: string,
  sub: WebPushSubscription,
  userAgent: string | null,
): Promise<void> {
  await client.query(
    `INSERT INTO push_subscriptions (account_id, user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (account_id, endpoint) DO UPDATE
       SET user_id = EXCLUDED.user_id,
           p256dh = EXCLUDED.p256dh,
           auth = EXCLUDED.auth,
           user_agent = EXCLUDED.user_agent,
           last_seen_at = now(),
           failed_at = NULL`,
    [accountId, userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth, userAgent],
  );
}

/** Delete a subscription by endpoint (unsubscribe / expired). */
export async function deleteSubscription(
  client: PoolClient,
  accountId: string,
  endpoint: string,
): Promise<void> {
  await client.query(
    `DELETE FROM push_subscriptions WHERE account_id = $1 AND endpoint = $2`,
    [accountId, endpoint],
  );
}

