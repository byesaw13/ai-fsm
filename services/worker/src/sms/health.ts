import type { Client } from "pg";
import { logger } from "../logger.js";
import { gatewayLastSeen, smsGatewayConfigured } from "./gateway.js";

const STALE_MS = 20 * 60 * 1000;
const CHECK_EVERY_MS = 5 * 60 * 1000;
let lastCheckAt = 0;

/**
 * One attention item per hour when the business phone has not checked in.
 * Texts fail silently while the SMS Gateway app is asleep.
 */
export async function alertIfSmsGatewayStale(client: Client): Promise<void> {
  if (!smsGatewayConfigured()) return;
  const now = Date.now();
  if (now - lastCheckAt < CHECK_EVERY_MS) return;
  lastCheckAt = now;
  let seen: Date | null = null;
  try {
    seen = await gatewayLastSeen();
  } catch (err) {
    logger.warn("sms gateway health check failed", { error: (err as Error).message });
    return;
  }
  if (seen && Date.now() - seen.getTime() < STALE_MS) return;

  const account = await client.query<{ id: string }>(
    `SELECT a.id
     FROM accounts a
     JOIN users u ON u.account_id = a.id
     WHERE u.role = 'owner'
     ORDER BY u.created_at
     LIMIT 1`
  );
  const accountId = account.rows[0]?.id;
  if (!accountId) return;

  const hour = new Date().toISOString().slice(0, 13);
  await client.query(
    `INSERT INTO attention_events
       (account_id, type, entity_type, entity_id, title, summary, href, dedupe_key)
     VALUES ($1, 'sms_gateway_offline', 'account', $1, $2, $3, '/app', $4)
     ON CONFLICT (account_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
    [
      accountId,
      "Business phone is offline",
      "The SMS Gateway app has not checked in. Service texts will fail until that phone is awake.",
      `sms-gateway-stale:${hour}`,
    ]
  );
  logger.warn("sms gateway phone is stale", { lastSeen: seen?.toISOString() ?? null });
}
