/**
 * Recompute and persist work order planning status from child visits.
 */

import type { PoolClient } from "pg";
import {
  deriveWorkOrderStatus,
  type CompletionCriterion,
  type WorkOrderVisitSnapshot,
} from "@ai-fsm/domain";
import type { VisitStatus, WorkOrderStatus } from "@ai-fsm/domain";

export async function syncWorkOrderStatus(
  client: PoolClient,
  workOrderId: string,
  accountId: string,
): Promise<WorkOrderStatus | null> {
  const woRes = await client.query<{ status: WorkOrderStatus; completion_criteria: unknown }>(
    `SELECT status, completion_criteria FROM work_orders
     WHERE id = $1 AND account_id = $2 FOR UPDATE`,
    [workOrderId, accountId],
  );
  const wo = woRes.rows[0];
  if (!wo || wo.status === "draft" || wo.status === "cancelled") return null;

  const visitRes = await client.query<WorkOrderVisitSnapshot>(
    `SELECT status, scheduled_start FROM visits
     WHERE work_order_id = $1 AND account_id = $2`,
    [workOrderId, accountId],
  );

  const criteria = Array.isArray(wo.completion_criteria)
    ? (wo.completion_criteria as CompletionCriterion[])
    : [];

  const derived = deriveWorkOrderStatus({
    currentStatus: wo.status,
    visits: visitRes.rows.map((v) => ({
      status: v.status as VisitStatus,
      scheduled_start: v.scheduled_start,
    })),
    completionCriteria: criteria,
  });

  if (derived !== wo.status) {
    await client.query(
      `UPDATE work_orders SET
         status = $3,
         completed_at = CASE WHEN $3 = 'completed' THEN COALESCE(completed_at, now())
                             WHEN $3 <> 'completed' THEN NULL
                             ELSE completed_at END,
         updated_at = now()
       WHERE id = $1 AND account_id = $2`,
      [workOrderId, accountId, derived],
    );
  }

  return derived;
}

/** Sync all work orders on a project (after visit create/transition). */
export async function syncWorkOrdersForJob(
  client: PoolClient,
  jobId: string,
  accountId: string,
): Promise<void> {
  const rows = await client.query<{ id: string }>(
    `SELECT id FROM work_orders
     WHERE job_id = $1 AND account_id = $2 AND status NOT IN ('draft', 'cancelled')`,
    [jobId, accountId],
  );
  for (const row of rows.rows) {
    await syncWorkOrderStatus(client, row.id, accountId);
  }
}

/** Resolve the work order for scheduling when exactly one active WO exists. */
export async function resolveWorkOrderForVisit(
  client: PoolClient,
  jobId: string,
  accountId: string,
  workOrderId?: string | null,
): Promise<string | null> {
  if (workOrderId) {
    const check = await client.query<{ id: string }>(
      `SELECT id FROM work_orders
       WHERE id = $1 AND job_id = $2 AND account_id = $3
         AND status NOT IN ('draft', 'cancelled')`,
      [workOrderId, jobId, accountId],
    );
    return check.rows[0]?.id ?? null;
  }

  const rows = await client.query<{ id: string }>(
    `SELECT id FROM work_orders
     WHERE job_id = $1 AND account_id = $2 AND status NOT IN ('draft', 'cancelled')
     ORDER BY created_at ASC`,
    [jobId, accountId],
  );
  if (rows.rows.length === 1) return rows.rows[0].id;
  return null;
}