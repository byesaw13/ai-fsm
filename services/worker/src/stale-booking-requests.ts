import type { Client } from "pg";
import { logger } from "./logger.js";

export interface StaleBookingRequestsResult {
  closed: number;
  errors: number;
}

/**
 * Marks open booking requests as lost when idle for 60+ days (no status/touch).
 * Uses updated_at so any stage advance or staff edit resets the clock.
 * Runs every worker poll — idempotent WHERE clause.
 */
export async function closeStaleBookingRequests(
  client: Client
): Promise<StaleBookingRequestsResult> {
  try {
    const result = await client.query<{ id: string; account_id: string }>(
      `UPDATE booking_requests
       SET status = 'lost',
           closed_reason = 'stale',
           closed_at = now(),
           updated_at = now()
       WHERE status IN ('pending', 'needs_info', 'reviewed', 'assessment_booked', 'estimated')
         AND updated_at < now() - interval '60 days'
       RETURNING id, account_id`
    );

    const closed = result.rowCount ?? 0;
    if (closed > 0) {
      logger.info("stale-booking-requests: marked lost", {
        count: closed,
        ids: result.rows.map((r) => r.id),
      });

      // Best-effort status history (batch; non-fatal if table missing in test)
      for (const row of result.rows) {
        try {
          await client.query(
            `INSERT INTO status_history
               (account_id, entity_type, entity_id, from_status, to_status, changed_by, note)
             VALUES ($1, 'booking_request', $2, NULL, 'lost', NULL, 'closed_reason=stale')`,
            [row.account_id, row.id]
          );
        } catch {
          /* ignore history failures */
        }
      }
    }

    return { closed, errors: 0 };
  } catch (error) {
    logger.error("stale-booking-requests: failed", error);
    return { closed: 0, errors: 1 };
  }
}
