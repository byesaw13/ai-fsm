/**
 * Send Web Push notifications (EPIC-005 TASK-118).
 *
 * Runs on the web tier only (the worker has no internet egress). Self-contained:
 * uses its own short DB transactions so a send is never part of the caller's
 * transaction, and the connection is released before the network round-trips
 * (never held open across web-push calls). Never throws to callers.
 *
 * Sets the RLS session context (account + owner role) on its own connection so
 * reads/prunes are correct whether or not the app DB role bypasses RLS — the
 * same defensive pattern as withDbSession and the location ingest route.
 */
import { Pool, type PoolClient } from "pg";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getWebPush, isPushConfigured } from "./vapid";
import { buildPushPayload, type PushInput } from "./payload";
import { ownerAndAdminUserIds } from "./recipients";
import { type PushSubscriptionRow } from "./subscriptions";

/**
 * Dedicated connection pool for push, separate from the request pool. Callers
 * (booking/estimate/payment/location) invoke sends while still holding their own
 * request-pool connection; acquiring from the same pool here could exhaust it
 * and deadlock. This isolated small pool cannot starve request traffic, and each
 * send releases its connection before the web-push network round-trips.
 */
let pushPool: Pool | null = null;
function getPushPool(): Pool {
  if (!pushPool) pushPool = new Pool({ connectionString: getEnv().DATABASE_URL, max: 2 });
  return pushPool;
}

/** Run fn in a short tx with the account's RLS context set locally. */
async function withAccountTx<T>(accountId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPushPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_account_id', $1, true),
              set_config('app.current_role', 'owner', true)`,
      [accountId],
    );
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function loadSubs(accountId: string, userIds: string[]): Promise<PushSubscriptionRow[]> {
  if (userIds.length === 0) return [];
  return withAccountTx(accountId, async (client) => {
    const { rows } = await client.query<PushSubscriptionRow>(
      `SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions
        WHERE account_id = $1 AND user_id = ANY($2) AND failed_at IS NULL`,
      [accountId, userIds],
    );
    return rows;
  });
}

/** Mark dead subscriptions (404/410) so they're skipped and can be cleaned up. */
async function markFailed(accountId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    await withAccountTx(accountId, (client) =>
      client.query(`UPDATE push_subscriptions SET failed_at = now() WHERE id = ANY($1)`, [ids]),
    );
  } catch (error) {
    logger.error("push: failed to mark dead subscriptions", error, { accountId });
  }
}

async function deliver(accountId: string, rows: PushSubscriptionRow[], input: PushInput): Promise<number> {
  const webpush = getWebPush();
  if (!webpush || rows.length === 0) return 0;

  const body = JSON.stringify(buildPushPayload(input));
  const dead: string[] = [];
  let sent = 0;

  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          body,
        );
        sent += 1;
      } catch (error) {
        const status = (error as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          dead.push(row.id); // expired/gone — prune
        } else {
          logger.error("push: send failed", error, { endpoint: row.endpoint.slice(0, 40), status });
        }
      }
    }),
  );

  await markFailed(accountId, dead);
  return sent;
}

/** Push to specific users in an account. Returns count actually delivered. */
export async function sendPushToUsers(
  accountId: string,
  userIds: string[],
  input: PushInput,
): Promise<number> {
  if (!isPushConfigured()) return 0;
  try {
    const rows = await loadSubs(accountId, userIds);
    return await deliver(accountId, rows, input);
  } catch (error) {
    logger.error("push: sendPushToUsers error", error, { accountId });
    return 0;
  }
}

export async function sendPushToUser(
  accountId: string,
  userId: string,
  input: PushInput,
): Promise<number> {
  return sendPushToUsers(accountId, [userId], input);
}

/** Push to every owner/admin in the account (the office-facing recipients). */
export async function sendPushToOwners(accountId: string, input: PushInput): Promise<number> {
  if (!isPushConfigured()) return 0;
  try {
    const ids = await withAccountTx(accountId, (client) => ownerAndAdminUserIds(client, accountId));
    const rows = await loadSubs(accountId, ids);
    return await deliver(accountId, rows, input);
  } catch (error) {
    logger.error("push: sendPushToOwners error", error, { accountId });
    return 0;
  }
}
