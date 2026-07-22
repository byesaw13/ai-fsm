import type { PoolClient } from "pg";
import { isFieldDeliverableTaskLabel } from "@ai-fsm/domain";
import type { WorkOrderTask } from "./task-time";
import { tasksToCriteria } from "./task-time";

export type JobTaskRow = WorkOrderTask & {
  work_order_title: string | null;
  work_order_status: string;
};

export type JobTaskProgress = {
  total: number;
  required_total: number;
  done: number;
  required_done: number;
  /** 0–100 based on required tasks (falls back to all tasks). */
  percent: number;
  tasks: JobTaskRow[];
};

/**
 * All first-class tasks on a project's work orders, ordered by WO then sort.
 */
export async function loadJobTasks(
  client: PoolClient,
  jobId: string,
  accountId: string,
): Promise<JobTaskRow[]> {
  const { rows } = await client.query<JobTaskRow>(
    `SELECT t.id, t.work_order_id, t.label, t.required, t.completed, t.status, t.note, t.sort_order,
            wo.title AS work_order_title, wo.status AS work_order_status
       FROM work_order_tasks t
       JOIN work_orders wo ON wo.id = t.work_order_id AND wo.account_id = t.account_id
      WHERE wo.job_id = $1 AND t.account_id = $2
        AND wo.status <> 'cancelled'
      ORDER BY wo.created_at ASC, t.sort_order ASC, t.created_at ASC`,
    [jobId, accountId],
  );
  return rows;
}

/** Drop pricing/planning rows that were wrongly seeded as checklist tasks. */
export function filterDeliverableTasks(tasks: JobTaskRow[]): JobTaskRow[] {
  return tasks.filter((t) => isFieldDeliverableTaskLabel(t.label));
}

export function computeTaskProgress(tasks: JobTaskRow[]): JobTaskProgress {
  const deliverable = filterDeliverableTasks(tasks);
  const total = deliverable.length;
  const required = deliverable.filter((t) => t.required);
  const required_total = required.length;
  const done = deliverable.filter((t) => t.completed).length;
  const required_done = required.filter((t) => t.completed).length;
  const denom = required_total > 0 ? required_total : total;
  const numer = required_total > 0 ? required_done : done;
  const percent = denom === 0 ? 0 : Math.round((numer / denom) * 100);
  return { total, required_total, done, required_done, percent, tasks: deliverable };
}

export async function loadJobTaskProgress(
  client: PoolClient,
  jobId: string,
  accountId: string,
): Promise<JobTaskProgress> {
  const tasks = await loadJobTasks(client, jobId, accountId);
  return computeTaskProgress(tasks);
}

/** Open (incomplete) tasks on a work order — for day planning multi-select. */
export async function loadOpenTasksForWorkOrder(
  client: PoolClient,
  workOrderId: string,
  accountId: string,
): Promise<Array<{ id: string; label: string; required: boolean }>> {
  const { rows } = await client.query<{ id: string; label: string; required: boolean }>(
    `SELECT id, label, required FROM work_order_tasks
      WHERE work_order_id = $1 AND account_id = $2 AND completed = false
      ORDER BY sort_order ASC, created_at ASC`,
    [workOrderId, accountId],
  );
  return rows;
}

/**
 * Replace the planned task set on a visit. Tasks must belong to the visit's
 * work order (or any WO on the visit's job if work_order_id is null).
 */
export async function setVisitPlannedTasks(
  client: PoolClient,
  opts: {
    accountId: string;
    visitId: string;
    jobId: string;
    workOrderId: string | null;
    taskIds: string[];
  },
): Promise<number> {
  const unique = [...new Set(opts.taskIds.filter(Boolean))];

  if (unique.length > 0) {
    const { rows: valid } = await client.query<{ id: string }>(
      opts.workOrderId
        ? `SELECT t.id FROM work_order_tasks t
             JOIN work_orders wo ON wo.id = t.work_order_id
            WHERE t.account_id = $1 AND wo.job_id = $2 AND wo.id = $3
              AND t.id = ANY($4::uuid[])`
        : `SELECT t.id FROM work_order_tasks t
             JOIN work_orders wo ON wo.id = t.work_order_id
            WHERE t.account_id = $1 AND wo.job_id = $2
              AND t.id = ANY($3::uuid[])`,
      opts.workOrderId
        ? [opts.accountId, opts.jobId, opts.workOrderId, unique]
        : [opts.accountId, opts.jobId, unique],
    );
    if (valid.length !== unique.length) {
      throw new Error("One or more tasks are not on this project/work order");
    }
  }

  await client.query(`DELETE FROM visit_tasks WHERE visit_id = $1 AND account_id = $2`, [
    opts.visitId,
    opts.accountId,
  ]);

  let n = 0;
  for (const taskId of unique) {
    await client.query(
      `INSERT INTO visit_tasks (account_id, visit_id, task_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (visit_id, task_id) DO NOTHING`,
      [opts.accountId, opts.visitId, taskId],
    );
    n += 1;
  }
  return n;
}

export type VisitTaskRow = {
  id: string;
  label: string;
  required: boolean;
  completed: boolean;
  status: string;
  work_order_id: string;
  work_order_title: string | null;
};

export async function loadVisitPlannedTasks(
  client: PoolClient,
  visitId: string,
  accountId: string,
): Promise<VisitTaskRow[]> {
  const { rows } = await client.query<VisitTaskRow>(
    `SELECT t.id, t.label, t.required, t.completed, t.status, t.work_order_id,
            wo.title AS work_order_title
       FROM visit_tasks vt
       JOIN work_order_tasks t ON t.id = vt.task_id AND t.account_id = vt.account_id
       JOIN work_orders wo ON wo.id = t.work_order_id
      WHERE vt.visit_id = $1 AND vt.account_id = $2
      ORDER BY t.sort_order ASC, t.created_at ASC`,
    [visitId, accountId],
  );
  return rows;
}

/** For FieldCloseout-style gates from visit planned tasks (progress only). */
export function visitTasksAsCriteria(tasks: VisitTaskRow[]) {
  return tasksToCriteria(
    tasks.map((t) => ({
      id: t.id,
      work_order_id: t.work_order_id,
      label: t.label,
      required: t.required,
      completed: t.completed,
      status: (t.status as "open" | "done" | "blocked") || "open",
      note: null,
      sort_order: 0,
    })),
  );
}
