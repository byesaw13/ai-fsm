import type { PoolClient } from "pg";
import {
  ATTENTION_RETENTION_DAYS,
  type AttentionEventRow,
} from "./types";

export async function listAttentionEvents(
  client: PoolClient,
  accountId: string,
  limit = 30,
): Promise<AttentionEventRow[]> {
  const capped = Math.min(Math.max(1, limit), 100);
  const r = await client.query<AttentionEventRow>(
    `SELECT id, account_id, type, entity_type, entity_id, title, summary, href,
            dedupe_key, created_at, read_at
     FROM attention_events
     WHERE account_id = $1
       AND created_at >= now() - ($2::text || ' days')::interval
     ORDER BY created_at DESC
     LIMIT $3`,
    [accountId, String(ATTENTION_RETENTION_DAYS), capped],
  );
  return r.rows;
}

export async function markAttentionEventRead(
  client: PoolClient,
  accountId: string,
  eventId: string,
): Promise<boolean> {
  const r = await client.query(
    `UPDATE attention_events
     SET read_at = COALESCE(read_at, now())
     WHERE id = $1 AND account_id = $2`,
    [eventId, accountId],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function markAllAttentionEventsRead(
  client: PoolClient,
  accountId: string,
): Promise<number> {
  const r = await client.query(
    `UPDATE attention_events
     SET read_at = now()
     WHERE account_id = $1
       AND read_at IS NULL
       AND created_at >= now() - ($2::text || ' days')::interval`,
    [accountId, String(ATTENTION_RETENTION_DAYS)],
  );
  return r.rowCount ?? 0;
}

export async function pruneOldAttentionEvents(
  client: PoolClient,
  retentionDays = ATTENTION_RETENTION_DAYS,
): Promise<number> {
  const r = await client.query(
    `DELETE FROM attention_events
     WHERE created_at < now() - ($1::text || ' days')::interval`,
    [String(retentionDays)],
  );
  return r.rowCount ?? 0;
}
