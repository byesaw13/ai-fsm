import type { Client } from "pg";
import { logger } from "./logger.js";

const RETENTION_DAYS = 90;

export interface PruneAttentionEventsResult {
  deleted: number;
  errors: number;
}

/**
 * Delete attention_events older than 90 days (design retention).
 */
export async function pruneAttentionEvents(
  client: Client,
): Promise<PruneAttentionEventsResult> {
  try {
    const result = await client.query(
      `DELETE FROM attention_events
       WHERE created_at < now() - ($1::text || ' days')::interval`,
      [String(RETENTION_DAYS)],
    );
    const deleted = result.rowCount ?? 0;
    if (deleted > 0) {
      logger.info("prune-attention-events: deleted stale rows", { deleted });
    }
    return { deleted, errors: 0 };
  } catch (error) {
    logger.error("prune-attention-events: failed", error);
    return { deleted: 0, errors: 1 };
  }
}
