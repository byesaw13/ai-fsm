/**
 * Recompute and persist work order planning status from child visits.
 */

import type { PoolClient } from "pg";
import {
  deriveWorkOrderStatus,
  type WorkOrderVisitSnapshot,
} from "@ai-fsm/domain";
import type { VisitStatus, WorkOrderStatus } from "@ai-fsm/domain";
import { loadWorkOrderCompletionCriteria } from "@/lib/work-orders/task-time";

/** Planning statuses that may already receive new execution visits. */
export const SCHEDULABLE_WORK_ORDER_STATUSES = [
  "ready",
  "scheduled",
  "dispatched",
  "waiting",
] as const;

/** Statuses that may be selected for scheduling (includes draft — promoted on book). */
export const BOOKABLE_WORK_ORDER_STATUSES = [
  "draft",
  ...SCHEDULABLE_WORK_ORDER_STATUSES,
] as const;

const schedulableList = SCHEDULABLE_WORK_ORDER_STATUSES.map((s) => `'${s}'`).join(", ");
const bookableList = BOOKABLE_WORK_ORDER_STATUSES.map((s) => `'${s}'`).join(", ");

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

  // Slice 1b: tasks are the completion checklist source of truth.
  const criteria = await loadWorkOrderCompletionCriteria(
    client,
    workOrderId,
    accountId,
    wo.completion_criteria,
  );

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
     WHERE job_id = $1 AND account_id = $2
       AND status IN (${schedulableList})`,
    [jobId, accountId],
  );
  for (const row of rows.rows) {
    await syncWorkOrderStatus(client, row.id, accountId);
  }
}

/**
 * Promote a draft work order to ready so visits can attach and status can derive.
 * No-op if not draft. Returns true when a row was updated.
 */
export async function promoteDraftWorkOrderToReady(
  client: PoolClient,
  workOrderId: string,
  accountId: string,
): Promise<boolean> {
  const r = await client.query(
    `UPDATE work_orders
     SET status = 'ready', updated_at = now()
     WHERE id = $1 AND account_id = $2 AND status = 'draft'`,
    [workOrderId, accountId],
  );
  return (r.rowCount ?? 0) > 0;
}

/**
 * Resolve the work order for scheduling.
 * - Explicit id: must belong to job; draft is accepted and promoted to ready.
 * - Auto: single bookable WO on the job (including one draft).
 */
export async function resolveWorkOrderForVisit(
  client: PoolClient,
  jobId: string,
  accountId: string,
  workOrderId?: string | null,
): Promise<string | null> {
  if (workOrderId) {
    const check = await client.query<{ id: string; status: string }>(
      `SELECT id, status FROM work_orders
       WHERE id = $1 AND job_id = $2 AND account_id = $3
         AND status IN (${bookableList})`,
      [workOrderId, jobId, accountId],
    );
    const row = check.rows[0];
    if (!row) return null;
    if (row.status === "draft") {
      await promoteDraftWorkOrderToReady(client, row.id, accountId);
    }
    return row.id;
  }

  const rows = await client.query<{ id: string; status: string }>(
    `SELECT id, status FROM work_orders
     WHERE job_id = $1 AND account_id = $2
       AND status IN (${bookableList})
     ORDER BY created_at ASC`,
    [jobId, accountId],
  );
  if (rows.rows.length !== 1) return null;
  const row = rows.rows[0];
  if (row.status === "draft") {
    await promoteDraftWorkOrderToReady(client, row.id, accountId);
  }
  return row.id;
}
