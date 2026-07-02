import type { PoolClient } from "pg";
import { appendAuditLog } from "@/lib/db/audit";

export interface CompleteAssessmentCascadeCtx {
  visitId: string;
  accountId: string;
  userId: string;
  traceId: string;
  assessmentCompletedAt: Date | string | null;
}

/**
 * When an assessment is marked complete, auto-close the parent site visit.
 * Closes any open pre-sale status (scheduled, arrived, in_progress, etc.).
 * Idempotent: no-op if visit is already completed/cancelled or not a site_visit.
 * Does not advance job status (pre-sale walkthrough ≠ execution complete).
 */
export async function completeAssessmentCascade(
  client: PoolClient,
  ctx: CompleteAssessmentCascadeCtx
): Promise<void> {
  if (!ctx.assessmentCompletedAt) {
    return;
  }

  const completedAt =
    ctx.assessmentCompletedAt instanceof Date
      ? ctx.assessmentCompletedAt
      : new Date(ctx.assessmentCompletedAt);

  const { rows: visitRows } = await client.query<{
    id: string;
    status: string;
    visit_type: string;
    completed_at: Date | null;
  }>(
    `SELECT id, status, visit_type, completed_at
     FROM visits
     WHERE id = $1 AND account_id = $2
     FOR UPDATE`,
    [ctx.visitId, ctx.accountId]
  );

  const visit = visitRows[0];
  if (!visit) return;
  if (visit.visit_type !== "site_visit") return;
  if (visit.status === "completed" || visit.status === "cancelled") return;

  const priorCompletedAt = visit.completed_at;

  const { rows: updated } = await client.query<{ id: string }>(
    `UPDATE visits
     SET status = 'completed'
     WHERE id = $1
       AND account_id = $2
       AND visit_type = 'site_visit'
       AND status NOT IN ('completed', 'cancelled')
     RETURNING id`,
    [ctx.visitId, ctx.accountId]
  );

  if (updated.length === 0) return;

  // Visit transition trigger sets completed_at = now() on status → completed.
  // Re-apply COALESCE(prior, assessmentCompletedAt, now()) so assessment timestamp wins.
  await client.query(
    `UPDATE visits
     SET completed_at = COALESCE($3, $4, now())
     WHERE id = $1 AND account_id = $2`,
    [ctx.visitId, ctx.accountId, priorCompletedAt, completedAt]
  );

  await appendAuditLog(client, {
    account_id: ctx.accountId,
    entity_type: "visit",
    entity_id: ctx.visitId,
    action: "update",
    actor_id: ctx.userId,
    trace_id: ctx.traceId,
    old_value: { status: visit.status },
    new_value: { status: "completed" },
  });
}

const DEFAULT_ESTIMATE_EXPIRY_DAYS = 30;

/**
 * Reads accounts.settings.estimate_expiry_days (default 30 when null/invalid).
 */
export async function resolveEstimateExpiryDays(
  client: PoolClient,
  accountId: string
): Promise<number> {
  const { rows } = await client.query<{ days: string | null }>(
    `SELECT settings->>'estimate_expiry_days' AS days
     FROM accounts
     WHERE id = $1`,
    [accountId]
  );

  const raw = rows[0]?.days;
  if (raw == null || raw === "") {
    return DEFAULT_ESTIMATE_EXPIRY_DAYS;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_ESTIMATE_EXPIRY_DAYS;
  }

  return parsed;
}

export interface SendEstimateCascadeCtx {
  estimateId: string;
  accountId: string;
  userId: string;
  traceId: string;
  jobId: string | null;
}

/**
 * On first send (draft → sent): set expires_at when null and advance linked job draft → quoted.
 * Idempotent: no-op when expires_at is already set or job is not draft.
 */
export async function sendEstimateCascade(
  client: PoolClient,
  ctx: SendEstimateCascadeCtx
): Promise<void> {
  const expiryDays = await resolveEstimateExpiryDays(client, ctx.accountId);

  // expires_at must be set while estimate is still draft — sent-state immutability
  // blocks changing it after status flips.
  await client.query(
    `UPDATE estimates
     SET expires_at = now() + ($3::int * interval '1 day'),
         updated_at = now()
     WHERE id = $1
       AND account_id = $2
       AND status = 'draft'
       AND expires_at IS NULL`,
    [ctx.estimateId, ctx.accountId, expiryDays]
  );

  if (!ctx.jobId) {
    return;
  }

  const { rows: jobRows } = await client.query<{ id: string; status: string }>(
    `SELECT id, status
     FROM jobs
     WHERE id = $1 AND account_id = $2
     FOR UPDATE`,
    [ctx.jobId, ctx.accountId]
  );

  const job = jobRows[0];
  if (!job || job.status !== "draft") {
    return;
  }

  const { rows: updated } = await client.query<{ id: string }>(
    `UPDATE jobs
     SET status = 'quoted'
     WHERE id = $1
       AND account_id = $2
       AND status = 'draft'
     RETURNING id`,
    [ctx.jobId, ctx.accountId]
  );

  if (updated.length === 0) {
    return;
  }

  await appendAuditLog(client, {
    account_id: ctx.accountId,
    entity_type: "job",
    entity_id: ctx.jobId,
    action: "update",
    actor_id: ctx.userId,
    trace_id: ctx.traceId,
    old_value: { status: "draft" },
    new_value: { status: "quoted" },
  });
}