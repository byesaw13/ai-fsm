import type { PoolClient } from "pg";
import { ATTENTION_RETENTION_DAYS, type AttentionSummary } from "./types";

/** Open funnel — matches BOOKING_REQUEST_OPEN_STATUSES / default Requests list. */
export const REQUEST_QUEUE_STATUSES_SQL = `('pending', 'needs_info', 'reviewed', 'assessment_booked', 'estimated')`;

/**
 * Distinct invoices needing owner attention:
 * - draft final/standard (finish/send)
 * - overdue (any kind)
 * - sent/partial never opened in portal
 */
export async function countRequestQueue(
  client: PoolClient,
  accountId: string,
): Promise<number> {
  const r = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM booking_requests
     WHERE account_id = $1
       AND status IN ${REQUEST_QUEUE_STATUSES_SQL}`,
    [accountId],
  );
  return parseInt(r.rows[0]?.count ?? "0", 10);
}

export async function countInvoiceAttention(
  client: PoolClient,
  accountId: string,
): Promise<number> {
  const r = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM invoices
     WHERE account_id = $1
       AND status != 'void'
       AND (
         (status = 'draft' AND invoice_kind IN ('final', 'standard'))
         OR status = 'overdue'
         OR (
           status IN ('sent', 'partial')
           AND first_viewed_at IS NULL
         )
       )`,
    [accountId],
  );
  return parseInt(r.rows[0]?.count ?? "0", 10);
}

export async function countUnreadAttentionEvents(
  client: PoolClient,
  accountId: string,
): Promise<number> {
  const r = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM attention_events
     WHERE account_id = $1
       AND read_at IS NULL
       AND created_at >= now() - ($2::text || ' days')::interval`,
    [accountId, String(ATTENTION_RETENTION_DAYS)],
  );
  return parseInt(r.rows[0]?.count ?? "0", 10);
}

export async function loadAttentionSummary(
  client: PoolClient,
  accountId: string,
): Promise<AttentionSummary> {
  const [requestsCount, invoicesCount, unreadEventCount] = await Promise.all([
    countRequestQueue(client, accountId),
    countInvoiceAttention(client, accountId),
    countUnreadAttentionEvents(client, accountId),
  ]);
  return { requestsCount, invoicesCount, unreadEventCount };
}

/** Display helper: 0 → null (hide), 100+ → "99+". */
export function formatBadgeCount(n: number): string | null {
  if (n <= 0) return null;
  if (n > 99) return "99+";
  return String(n);
}
