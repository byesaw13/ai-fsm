import type { PoolClient } from "pg";
import { logger } from "@/lib/logger";
import type { EmitAttentionEventInput } from "./types";
import { ATTENTION_PUSH_TYPES } from "./types";
import { enqueueAttentionOwnerEmail } from "./email";
import { sendPushToOwners } from "@/lib/push/send";

/**
 * Insert an attention event. Never throws to callers — primary flows must not fail.
 * Returns event id when inserted, null when deduped or on error.
 * On new insert, may enqueue owner email for high-signal types.
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

    let insertedId: string | null = null;

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
      insertedId = r.rows[0]?.id ?? null;
    } else {
      const r = await client.query<{ id: string }>(
        `INSERT INTO attention_events
           (account_id, type, entity_type, entity_id, title, summary, href, dedupe_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        params,
      );
      insertedId = r.rows[0]?.id ?? null;
    }

    // Only email on newly inserted rows (not deduped no-ops).
    // SAVEPOINT so a failed queue insert cannot abort the caller's transaction
    // (e.g. Square payment COMMIT must not roll back after a non-fatal email error).
    if (insertedId) {
      try {
        await client.query("SAVEPOINT attention_email");
        await enqueueAttentionOwnerEmail(client, {
          accountId: input.accountId,
          type: input.type,
          entityType: input.entityType,
          entityId: input.entityId,
          title: input.title,
          summary: input.summary,
          href: input.href,
        });
        await client.query("RELEASE SAVEPOINT attention_email");
      } catch (emailErr) {
        try {
          await client.query("ROLLBACK TO SAVEPOINT attention_email");
        } catch {
          // ignore nested rollback errors
        }
        logger.error("attention owner email failed (non-fatal)", emailErr, {
          type: input.type,
          entityId: input.entityId,
        });
      }

      // Web Push to owners/admins (TASK-118). Runs on its own connection (not
      // the caller's tx) and never throws, so no savepoint is needed here.
      if ((ATTENTION_PUSH_TYPES as readonly string[]).includes(input.type)) {
        await sendPushToOwners(input.accountId, {
          title: input.title,
          body: input.summary ?? undefined,
          url: input.href,
          tag: `attn-${input.type}-${input.entityId}`,
        });
      }
    }

    return insertedId;
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
