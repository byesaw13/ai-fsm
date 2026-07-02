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