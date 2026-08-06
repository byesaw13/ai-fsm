import type { PoolClient } from "pg";
import { ATTENTION_RETENTION_DAYS, type AttentionSummary } from "./types";

/** Open funnel — matches BOOKING_REQUEST_OPEN_STATUSES / default Requests list. */
export const REQUEST_QUEUE_STATUSES_SQL = `('pending', 'needs_info', 'reviewed', 'assessment_booked', 'estimated')`;

/**
 * Invoice attention predicate (no account filter).
 * `alias` e.g. "i" → `i.status`; empty → bare columns.
 */
export function invoiceAttentionPredicate(alias = ""): string {
  const p = alias ? `${alias}.` : "";
  return `
  ${p}status != 'void'
  AND (
    (${p}status = 'draft' AND ${p}invoice_kind IN ('final', 'standard'))
    OR ${p}status = 'overdue'
    OR (
      ${p}status IN ('sent', 'partial')
      AND ${p}first_viewed_at IS NULL
    )
  )`;
}

/**
 * Estimate attention predicate (no account filter).
 * Sent, not past expiry.
 */
export function estimateAttentionPredicate(alias = ""): string {
  const p = alias ? `${alias}.` : "";
  return `
  ${p}status = 'sent'
  AND (${p}expires_at IS NULL OR ${p}expires_at >= CURRENT_DATE)`;
}

/** Full WHERE for invoice attention counts. Params: account_id as $1. */
export const INVOICE_ATTENTION_WHERE = `
  account_id = $1
  AND ${invoiceAttentionPredicate()}
`;

/** Full WHERE for estimate attention counts. Params: account_id as $1. */
export const ESTIMATE_ATTENTION_WHERE = `
  account_id = $1
  AND ${estimateAttentionPredicate()}
`;

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
     WHERE ${INVOICE_ATTENTION_WHERE}`,
    [accountId],
  );
  return parseInt(r.rows[0]?.count ?? "0", 10);
}

export async function countEstimateAttention(
  client: PoolClient,
  accountId: string,
): Promise<number> {
  const r = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM estimates
     WHERE ${ESTIMATE_ATTENTION_WHERE}`,
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
  const [requestsCount, invoicesCount, estimatesCount, unreadEventCount] =
    await Promise.all([
      countRequestQueue(client, accountId),
      countInvoiceAttention(client, accountId),
      countEstimateAttention(client, accountId),
      countUnreadAttentionEvents(client, accountId),
    ]);
  return { requestsCount, invoicesCount, estimatesCount, unreadEventCount };
}

/** Display helper: 0 → null (hide), 100+ → "99+". */
export function formatBadgeCount(n: number): string | null {
  if (n <= 0) return null;
  if (n > 99) return "99+";
  return String(n);
}
