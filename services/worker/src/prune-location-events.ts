import type { Client } from "pg";
import { logger } from "./logger.js";

export interface PruneLocationEventsResult {
  deleted: number;
  errors: number;
}

/**
 * Delete raw GPS breadcrumbs older than each account's location_retention_days.
 * Confirmed activity_entries and location_segments are untouched (TASK-046).
 */
export async function pruneLocationEvents(client: Client): Promise<PruneLocationEventsResult> {
  try {
    const result = await client.query(
      `DELETE FROM location_events le
       USING accounts a
       WHERE le.account_id = a.id
         AND le.occurred_at < now() - (a.location_retention_days || ' days')::interval`,
    );
    const deleted = result.rowCount ?? 0;
    if (deleted > 0) {
      logger.info("prune-location-events: deleted stale breadcrumbs", { deleted });
    }
    return { deleted, errors: 0 };
  } catch (error) {
    logger.error("prune-location-events: failed", error);
    return { deleted: 0, errors: 1 };
  }
}