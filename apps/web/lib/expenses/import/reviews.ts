/**
 * Review records for store purchase imports (TASK-211; design §3 "Staging and
 * recovery", "Review records in history mode", "Dismiss with reason").
 *
 * A pending record is not an expense, adds nothing to job cost and produces no
 * price observations. Confirming runs in the caller's transaction: everything it
 * books and marking the record resolved succeed together or not at all.
 */
import type { PoolClient } from "pg";
import { appendAuditLog } from "@/lib/db/audit";
import { recordObservations } from "@/lib/materials/ledger";
import type { ReviewReason } from "../duplicate-match";
import { transactionIdentity } from "./identity";
import {
  bookTrip,
  linkTrip,
  linkedTripObservations,
  tripObservations,
  type Actor,
  type ImportMode,
  type ImportSource,
  type ImportTrip,
} from "./run";

export type ReviewStatus = "pending" | "resolved_same" | "resolved_different" | "dismissed";

export interface ReviewPayload {
  source: ImportSource;
  trip: ImportTrip;
}

export interface ReviewRecord {
  id: string;
  mode: ImportMode;
  reason: ReviewReason;
  status: ReviewStatus;
  value_cents: number;
  payload: ReviewPayload;
  match_expense_id: string | null;
  match: { vendor_name: string; expense_date: string; amount_cents: number } | null;
  dismiss_reason: string | null;
  expense_id: string | null;
  created_at: string;
  resolved_at: string | null;
}

export class ReviewStateError extends Error {}

/** Idempotent on (account, mode, identity): a re-import never makes a second record. */
export async function createReview(
  client: PoolClient,
  actor: Actor,
  r: {
    mode: ImportMode;
    identityKey: string;
    reason: ReviewReason;
    payload: ReviewPayload;
    valueCents: number;
    matchExpenseId?: string | null;
  },
): Promise<{ id: string; created: boolean; status: ReviewStatus }> {
  const ins = await client.query<{ id: string }>(
    `INSERT INTO purchase_import_reviews
       (account_id, mode, identity_key, reason, payload, value_cents, match_expense_id, created_by)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
     ON CONFLICT (account_id, mode, identity_key) DO NOTHING
     RETURNING id`,
    [actor.accountId, r.mode, r.identityKey, r.reason, JSON.stringify(r.payload), r.valueCents, r.matchExpenseId ?? null, actor.userId],
  );
  if (ins.rows[0]) return { id: ins.rows[0].id, created: true, status: "pending" };
  const { rows } = await client.query<{ id: string; status: ReviewStatus }>(
    `SELECT id, status FROM purchase_import_reviews WHERE account_id = $1 AND mode = $2 AND identity_key = $3`,
    [actor.accountId, r.mode, r.identityKey],
  );
  return { id: rows[0].id, created: false, status: rows[0].status };
}

async function lockReview(client: PoolClient, accountId: string, id: string) {
  const { rows } = await client.query<{
    id: string;
    mode: ImportMode;
    status: ReviewStatus;
    payload: ReviewPayload;
    match_expense_id: string | null;
    dismiss_reason: string | null;
  }>(
    `SELECT id, mode, status, payload, match_expense_id, dismiss_reason
     FROM purchase_import_reviews WHERE account_id = $1 AND id = $2 FOR UPDATE`,
    [accountId, id],
  );
  if (!rows[0]) throw new ReviewStateError("Review not found");
  return rows[0];
}

/**
 * "same": the trip is the purchase already on file. Book mode attaches it to the
 * matching receipt; history mode keeps the existing evidence and adds nothing.
 * "different": a purchase of its own. Book mode books it as an expense with line
 * items; both modes make its price observations active. History mode never books.
 */
export async function confirmReview(
  client: PoolClient,
  actor: Actor,
  id: string,
  decision: "same" | "different",
): Promise<{ expenseId: string | null; observations: number }> {
  const review = await lockReview(client, actor.accountId, id);
  if (review.status !== "pending") throw new ReviewStateError("This record is not pending");
  const { source, trip } = review.payload;
  const scope = transactionIdentity(trip) ?? `review:${review.id}`;

  let expenseId: string | null = null;
  let observations = 0;
  if (decision === "same") {
    if (review.mode === "book") {
      if (!review.match_expense_id) throw new ReviewStateError("There is no matching receipt to attach this trip to");
      await linkTrip(client, actor, source, trip, review.match_expense_id);
      expenseId = review.match_expense_id;
      const rows = await linkedTripObservations(client, actor, source, trip, review.match_expense_id, scope);
      observations = (await recordObservations(client, actor.accountId, rows)).inserted;
    }
  } else {
    if (review.mode === "book") expenseId = await bookTrip(client, actor, source, trip);
    const rows = await tripObservations(client, actor, source, trip, scope);
    observations = (await recordObservations(client, actor.accountId, rows)).inserted;
  }

  await client.query(
    `UPDATE purchase_import_reviews
     SET status = $3, expense_id = $4, resolved_by = $5, resolved_at = now(), updated_at = now()
     WHERE account_id = $1 AND id = $2`,
    [actor.accountId, id, decision === "same" ? "resolved_same" : "resolved_different", expenseId, actor.userId],
  );
  await appendAuditLog(client, {
    account_id: actor.accountId,
    entity_type: "purchase_import_review",
    entity_id: id,
    action: "update",
    actor_id: actor.userId,
    trace_id: actor.traceId ?? null,
    old_value: { status: "pending" },
    new_value: { status: decision === "same" ? "resolved_same" : "resolved_different", expense_id: expenseId, observations },
  });
  return { expenseId, observations };
}

/** Kept, never deleted; excluded from costs and price evidence until reopened. */
export async function dismissReview(client: PoolClient, actor: Actor, id: string, reason: string): Promise<void> {
  const review = await lockReview(client, actor.accountId, id);
  if (review.status !== "pending") throw new ReviewStateError("Only a pending record can be dismissed");
  const why = reason.trim().slice(0, 200);
  if (!why) throw new ReviewStateError("Give a reason, for example \"personal purchase\"");
  await client.query(
    `UPDATE purchase_import_reviews
     SET status = 'dismissed', dismiss_reason = $3, resolved_by = $4, resolved_at = now(), updated_at = now()
     WHERE account_id = $1 AND id = $2`,
    [actor.accountId, id, why, actor.userId],
  );
  await appendAuditLog(client, {
    account_id: actor.accountId,
    entity_type: "purchase_import_review",
    entity_id: id,
    action: "update",
    actor_id: actor.userId,
    trace_id: actor.traceId ?? null,
    old_value: { status: "pending" },
    new_value: { status: "dismissed", dismiss_reason: why },
  });
}

/** Back to pending, with its history (the audit log) intact. */
export async function reopenReview(client: PoolClient, actor: Actor, id: string): Promise<void> {
  const review = await lockReview(client, actor.accountId, id);
  if (review.status !== "dismissed") throw new ReviewStateError("Only a dismissed record can be reopened");
  await client.query(
    `UPDATE purchase_import_reviews
     SET status = 'pending', dismiss_reason = NULL, resolved_by = NULL, resolved_at = NULL, updated_at = now()
     WHERE account_id = $1 AND id = $2`,
    [actor.accountId, id],
  );
  await appendAuditLog(client, {
    account_id: actor.accountId,
    entity_type: "purchase_import_review",
    entity_id: id,
    action: "update",
    actor_id: actor.userId,
    trace_id: actor.traceId ?? null,
    old_value: { status: "dismissed", dismiss_reason: review.dismiss_reason },
    new_value: { status: "pending" },
  });
}

export async function pendingSummary(client: PoolClient, accountId: string): Promise<{ count: number; valueCents: number }> {
  const { rows } = await client.query<{ count: number; value: number }>(
    `SELECT count(*)::int AS count, COALESCE(sum(value_cents), 0)::int AS value
     FROM purchase_import_reviews WHERE account_id = $1 AND status = 'pending'`,
    [accountId],
  );
  return { count: rows[0].count, valueCents: rows[0].value };
}

/** Pending and dismissed records, newest first, with the receipt each may match. */
export async function listReviews(client: PoolClient, accountId: string): Promise<ReviewRecord[]> {
  const { rows } = await client.query<ReviewRecord & { m_vendor: string | null; m_date: string | null; m_amount: number | null }>(
    `SELECT r.id, r.mode, r.reason, r.status, r.value_cents, r.payload, r.match_expense_id,
            r.dismiss_reason, r.expense_id, r.created_at::text AS created_at, r.resolved_at::text AS resolved_at,
            e.vendor_name AS m_vendor, e.expense_date::text AS m_date, e.amount_cents AS m_amount
     FROM purchase_import_reviews r
     LEFT JOIN expenses e ON e.id = r.match_expense_id AND e.account_id = r.account_id
     WHERE r.account_id = $1 AND r.status IN ('pending', 'dismissed')
     ORDER BY r.status = 'pending' DESC, (r.payload->'trip'->>'date') DESC, r.created_at DESC
     LIMIT 500`,
    [accountId],
  );
  return rows.map(({ m_vendor, m_date, m_amount, ...r }) => ({
    ...r,
    match: m_vendor && m_date && m_amount !== null ? { vendor_name: m_vendor, expense_date: m_date, amount_cents: m_amount } : null,
  }));
}
