import type { PoolClient } from "pg";
import { isFieldDeliverableTaskLabel } from "@ai-fsm/domain";
import type { WorkOrderTask } from "./task-time";
import { mirrorTasksToCompletionCriteria, tasksToCriteria } from "./task-time";

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

/**
 * Tasks eligible for day planning multi-select.
 * Done tasks are never selectable. Partial/open/blocked can still be planned.
 */
export async function loadOpenTasksForWorkOrder(
  client: PoolClient,
  workOrderId: string,
  accountId: string,
): Promise<Array<{ id: string; label: string; required: boolean; status: string }>> {
  const { rows } = await client.query<{
    id: string;
    label: string;
    required: boolean;
    status: string;
  }>(
    `SELECT id, label, required, status FROM work_order_tasks
      WHERE work_order_id = $1 AND account_id = $2
        AND completed = false
        AND status <> 'done'
      ORDER BY sort_order ASC, created_at ASC`,
    [workOrderId, accountId],
  );
  return rows;
}

/** All incomplete tasks on a job (for visit-day planner when WO is known or not). */
export async function loadSelectableTasksForJob(
  client: PoolClient,
  jobId: string,
  accountId: string,
  workOrderId?: string | null,
): Promise<Array<{ id: string; label: string; required: boolean; status: string; work_order_id: string; work_order_title: string | null }>> {
  const { rows } = await client.query<{
    id: string;
    label: string;
    required: boolean;
    status: string;
    work_order_id: string;
    work_order_title: string | null;
  }>(
    workOrderId
      ? `SELECT t.id, t.label, t.required, t.status, t.work_order_id, wo.title AS work_order_title
           FROM work_order_tasks t
           JOIN work_orders wo ON wo.id = t.work_order_id
          WHERE t.account_id = $1 AND wo.job_id = $2 AND wo.id = $3
            AND t.completed = false AND t.status <> 'done'
            AND wo.status <> 'cancelled'
          ORDER BY t.sort_order ASC, t.created_at ASC`
      : `SELECT t.id, t.label, t.required, t.status, t.work_order_id, wo.title AS work_order_title
           FROM work_order_tasks t
           JOIN work_orders wo ON wo.id = t.work_order_id
          WHERE t.account_id = $1 AND wo.job_id = $2
            AND t.completed = false AND t.status <> 'done'
            AND wo.status <> 'cancelled'
          ORDER BY wo.created_at ASC, t.sort_order ASC`,
    workOrderId ? [accountId, jobId, workOrderId] : [accountId, jobId],
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
    // Open/partial may be newly planned. Done tasks may stay on the day if already
    // planned (locked in the UI) so re-saving a plan does not drop completed work.
    const { rows: valid } = await client.query<{ id: string }>(
      opts.workOrderId
        ? `SELECT t.id FROM work_order_tasks t
             JOIN work_orders wo ON wo.id = t.work_order_id
            WHERE t.account_id = $1 AND wo.job_id = $2 AND wo.id = $3
              AND t.id = ANY($4::uuid[])
              AND (
                (t.completed = false AND t.status <> 'done')
                OR EXISTS (
                  SELECT 1 FROM visit_tasks vt
                  WHERE vt.visit_id = $5 AND vt.task_id = t.id AND vt.account_id = $1
                )
              )`
        : `SELECT t.id FROM work_order_tasks t
             JOIN work_orders wo ON wo.id = t.work_order_id
            WHERE t.account_id = $1 AND wo.job_id = $2
              AND t.id = ANY($3::uuid[])
              AND (
                (t.completed = false AND t.status <> 'done')
                OR EXISTS (
                  SELECT 1 FROM visit_tasks vt
                  WHERE vt.visit_id = $4 AND vt.task_id = t.id AND vt.account_id = $1
                )
              )`,
      opts.workOrderId
        ? [opts.accountId, opts.jobId, opts.workOrderId, unique, opts.visitId]
        : [opts.accountId, opts.jobId, unique, opts.visitId],
    );
    if (valid.length !== unique.length) {
      throw new Error("Only open or started (not finished) tasks can be planned on a day — done tasks are locked");
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
      status: (t.status as "open" | "done" | "blocked" | "partial") || "open",
      note: null,
      sort_order: 0,
    })),
  );
}

/**
 * Mark a task as started-but-not-finished and create a new remainder task
 * ("what is left to do"). The remainder is open and required.
 */
export async function markTaskPartialWithRemainder(
  client: PoolClient,
  opts: {
    accountId: string;
    workOrderId: string;
    taskId: string;
    remainderLabel: string;
    note?: string | null;
  },
): Promise<{ originalId: string; remainderId: string }> {
  const remainder = opts.remainderLabel.trim();
  if (remainder.length < 2) {
    throw new Error("Describe what is left to do on this task");
  }

  const { rows: existing } = await client.query<{
    id: string;
    completed: boolean;
    status: string;
    sort_order: number;
  }>(
    `SELECT id, completed, status, sort_order FROM work_order_tasks
      WHERE id = $1 AND work_order_id = $2 AND account_id = $3 FOR UPDATE`,
    [opts.taskId, opts.workOrderId, opts.accountId],
  );
  const cur = existing[0];
  if (!cur) throw new Error("Task not found");
  if (cur.completed || cur.status === "done") {
    throw new Error("Done tasks cannot be reopened as partial — they are locked");
  }

  await client.query(
    `UPDATE work_order_tasks
        SET status = 'partial',
            completed = false,
            completed_at = NULL,
            note = COALESCE(NULLIF($3, ''), note),
            updated_at = now()
      WHERE id = $1 AND account_id = $2`,
    [opts.taskId, opts.accountId, opts.note ?? null],
  );

  const { rows: ins } = await client.query<{ id: string }>(
    `INSERT INTO work_order_tasks
       (account_id, work_order_id, label, required, completed, status, sort_order, source, parent_task_id, note)
     VALUES ($1, $2, $3, true, false, 'open', $4, 'manual', $5, $6)
     RETURNING id`,
    [
      opts.accountId,
      opts.workOrderId,
      remainder.slice(0, 300),
      (cur.sort_order ?? 0) + 1,
      opts.taskId,
      `Remainder of started task`,
    ],
  );

  await mirrorTasksToCompletionCriteria(client, opts.workOrderId, opts.accountId);

  return { originalId: opts.taskId, remainderId: ins[0].id };
}
