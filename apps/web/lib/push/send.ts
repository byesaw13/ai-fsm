/**
 * Send Web Push notifications (EPIC-005 TASK-118).
 *
 * Runs on the web tier only (the worker has no internet egress). Self-contained:
 * uses its own pooled connection so a send is never part of the caller's
 * transaction — a failed send must not roll back the primary write, and the
 * network round-trip must not hold a DB tx open. Never throws to callers.
 *
 * Reads are account-scoped in SQL, so this is correct even though the pool role
 * bypasses RLS.
 */
import { getPool } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getWebPush } from "./vapid";
import { buildPushPayload, type PushInput } from "./payload";
import { ownerAndAdminUserIds } from "./recipients";
import { listSubscriptionsForUsers, type PushSubscriptionRow } from "./subscriptions";

/** Mark a dead subscription (404/410) so it's skipped and can be cleaned up. */
async function markFailed(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    await getPool().query(
      `UPDATE push_subscriptions SET failed_at = now() WHERE id = ANY($1)`,
      [ids],
    );
  } catch (error) {
    logger.error("push: failed to mark dead subscriptions", error);
  }
}

async function sendToRows(rows: PushSubscriptionRow[], input: PushInput): Promise<number> {
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

  await markFailed(dead);
  return sent;
}

/** Push to specific users in an account. Returns count actually delivered. */
export async function sendPushToUsers(
  accountId: string,
  userIds: string[],
  input: PushInput,
): Promise<number> {
  if (!getWebPush()) return 0;
  const client = await getPool().connect();
  try {
    const rows = await listSubscriptionsForUsers(client, accountId, userIds);
    return await sendToRows(rows, input);
  } catch (error) {
    logger.error("push: sendPushToUsers error", error, { accountId });
    return 0;
  } finally {
    client.release();
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
  if (!getWebPush()) return 0;
  const client = await getPool().connect();
  try {
    const ids = await ownerAndAdminUserIds(client, accountId);
    const rows = await listSubscriptionsForUsers(client, accountId, ids);
    return await sendToRows(rows, input);
  } catch (error) {
    logger.error("push: sendPushToOwners error", error, { accountId });
    return 0;
  } finally {
    client.release();
  }
}
