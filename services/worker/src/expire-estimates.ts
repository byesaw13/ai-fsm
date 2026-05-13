import type { Client } from "pg";
import { logger } from "./logger.js";

export interface ExpireEstimatesResult {
  expired: number;
  errors: number;
}

/**
 * Marks sent estimates as expired when their expires_at date has passed.
 * Runs on every worker poll iteration — no automation record required.
 * Safe to run repeatedly; the WHERE clause is idempotent.
 */
export async function expireEstimates(client: Client): Promise<ExpireEstimatesResult> {
  try {
    const result = await client.query<{ id: string; account_id: string }>(
      `UPDATE estimates
       SET status = 'expired', updated_at = now()
       WHERE status = 'sent'
         AND expires_at IS NOT NULL
         AND expires_at < now()
       RETURNING id, account_id`
    );

    const expired = result.rowCount ?? 0;
    if (expired > 0) {
      logger.info("expire-estimates: marked expired", {
        count: expired,
        ids: result.rows.map((r) => r.id),
      });
    }

    return { expired, errors: 0 };
  } catch (error) {
    logger.error("expire-estimates: failed", error);
    return { expired: 0, errors: 1 };
  }
}
