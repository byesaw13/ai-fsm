import type { PoolClient } from "pg";
import { logger } from "@/lib/logger";
import type { EmitAttentionEventInput } from "./types";

/**
 * Insert an attention event. Never throws to callers — primary flows must not fail.
 * Returns event id when inserted, null when deduped or on error.
 */
export async function emitAttentionEvent(
  client: PoolClient,
  input: EmitAttentionEventInput,
): Promise<string | null> {
  try {
    const params = [
      input.accountId,
      input.type,
      input.entityType,
      input.entityId,
      input.title,
      input.summary ?? null,
      input.href,
      input.dedupeKey ?? null,
    ];

    if (input.dedupeKey) {
      const r = await client.query<{ id: string }>(
        `INSERT INTO attention_events
           (account_id, type, entity_type, entity_id, title, summary, href, dedupe_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (account_id, dedupe_key) WHERE dedupe_key IS NOT NULL
         DO NOTHING
         RETURNING id`,
        params,
      );
      return r.rows[0]?.id ?? null;
    }

    const r = await client.query<{ id: string }>(
      `INSERT INTO attention_events
         (account_id, type, entity_type, entity_id, title, summary, href, dedupe_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      params,
    );
    return r.rows[0]?.id ?? null;
  } catch (err) {
    logger.error("emitAttentionEvent failed (non-fatal)", err, {
      type: input.type,
      entityId: input.entityId,
    });
    return null;
  }
}

/** Mark all unread events for an entity as read (when owner opens the record). */
export async function markEntityAttentionRead(
  client: PoolClient,
  accountId: string,
  entityType: string,
  entityId: string,
): Promise<number> {
  try {
    const r = await client.query(
      `UPDATE attention_events
       SET read_at = now()
       WHERE account_id = $1
         AND entity_type = $2
         AND entity_id = $3
         AND read_at IS NULL`,
      [accountId, entityType, entityId],
    );
    return r.rowCount ?? 0;
  } catch (err) {
    logger.error("markEntityAttentionRead failed (non-fatal)", err);
    return 0;
  }
}
