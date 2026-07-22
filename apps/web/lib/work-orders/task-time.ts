import type { PoolClient } from "pg";
import type { CompletionCriterion } from "@ai-fsm/domain";

/**
 * A work-order task row (first-class, migration 155). This is the checklist
 * item the field checks off AND the unit captured time attaches to.
 */
export interface WorkOrderTask {
  id: string;
  work_order_id: string;
  label: string;
  required: boolean;
  completed: boolean;
  status: "open" | "done" | "blocked";
  note: string | null;
  sort_order: number;
}

/** Loose shape from completion_criteria JSONB (canonical + legacy). */
export type CriteriaJsonItem = {
  label?: string;
  description?: string;
  required?: boolean;
  completed?: boolean;
  done?: boolean;
};

/**
 * Normalize completion_criteria JSON into seedable task rows.
 * Shared by WO create/update paths so post-migration work orders still get tasks.
 */
export function criteriaItemsToTaskSeeds(
  criteria: unknown,
): Array<{ label: string; required: boolean; completed: boolean; sort_order: number }> {
  if (!Array.isArray(criteria)) return [];
  const out: Array<{ label: string; required: boolean; completed: boolean; sort_order: number }> = [];
  for (let i = 0; i < criteria.length; i++) {
    const c = criteria[i] as CriteriaJsonItem;
    if (!c || typeof c !== "object") continue;
    const label = String(c.label ?? c.description ?? "").trim();
    if (!label) continue;
    const completed = Boolean(c.completed ?? c.done ?? false);
    out.push({
      label,
      required: c.required !== false,
      completed,
      sort_order: i,
    });
  }
  return out;
}

/**
 * Insert first-class tasks from completion_criteria. No-op if the WO already
 * has tasks (idempotent for promote/retry). Call after INSERT/UPDATE of criteria.
 */
export async function seedWorkOrderTasksFromCriteria(
  client: PoolClient,
  opts: { accountId: string; workOrderId: string; criteria: unknown; source?: "estimate" | "manual" | "ai" },
): Promise<number> {
  const seeds = criteriaItemsToTaskSeeds(opts.criteria);
  if (seeds.length === 0) return 0;

  const existing = await client.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM work_order_tasks WHERE work_order_id = $1 AND account_id = $2`,
    [opts.workOrderId, opts.accountId],
  );
  if (parseInt(existing.rows[0]?.n ?? "0", 10) > 0) return 0;

  const source = opts.source ?? "manual";
  let inserted = 0;
  for (const s of seeds) {
    await client.query(
      `INSERT INTO work_order_tasks
         (account_id, work_order_id, label, required, completed, completed_at, status, sort_order, source)
       VALUES ($1, $2, $3, $4, $5, CASE WHEN $5 THEN now() END, CASE WHEN $5 THEN 'done' ELSE 'open' END, $6, $7)`,
      [opts.accountId, opts.workOrderId, s.label, s.required, s.completed, s.sort_order, source],
    );
    inserted++;
  }
  return inserted;
}

/** A captured time entry attributed to a task. */
export interface TaskTimeEntry {
  task_id: string | null;
  /** Minutes; caller may derive from ended_at - started_at. */
  minutes: number;
}

/**
 * Map first-class tasks to the pure `CompletionCriterion` shape so the existing
 * domain completion gates (`allRequiredCriteriaMet`, `completionGateMessage`)
 * work unchanged now that tasks — not the JSONB column — are the source of truth.
 */
export function tasksToCriteria(tasks: WorkOrderTask[]): CompletionCriterion[] {
  return tasks.map((t) => ({
    id: t.id,
    label: t.label,
    required: t.required,
    completed: t.completed,
  }));
}

/**
 * Total captured minutes per task id. The baseline actual for a task is the sum
 * of every activity_entry carrying its task_id.
 */
export function minutesByTask(entries: TaskTimeEntry[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of entries) {
    if (!e.task_id) continue;
    const m = Math.max(0, Math.round(e.minutes || 0));
    out.set(e.task_id, (out.get(e.task_id) ?? 0) + m);
  }
  return out;
}

/** Load first-class tasks for a work order (sort_order). */
export async function loadWorkOrderTasks(
  client: PoolClient,
  workOrderId: string,
  accountId: string,
): Promise<WorkOrderTask[]> {
  const { rows } = await client.query<WorkOrderTask>(
    `SELECT id, work_order_id, label, required, completed, status, note, sort_order
       FROM work_order_tasks
      WHERE work_order_id = $1 AND account_id = $2
      ORDER BY sort_order ASC, created_at ASC`,
    [workOrderId, accountId],
  );
  return rows;
}

/**
 * Completion criteria for gates/UI — **tasks are the source of truth**.
 * Seeds tasks from JSONB once when none exist (legacy WOs), then returns tasks
 * as CompletionCriterion. Falls back to JSONB only if still empty.
 */
export async function loadWorkOrderCompletionCriteria(
  client: PoolClient,
  workOrderId: string,
  accountId: string,
  fallbackJson?: unknown,
): Promise<CompletionCriterion[]> {
  let tasks = await loadWorkOrderTasks(client, workOrderId, accountId);
  if (tasks.length === 0 && fallbackJson != null) {
    await seedWorkOrderTasksFromCriteria(client, {
      accountId,
      workOrderId,
      criteria: fallbackJson,
      source: "manual",
    });
    tasks = await loadWorkOrderTasks(client, workOrderId, accountId);
  }
  if (tasks.length > 0) return tasksToCriteria(tasks);

  if (Array.isArray(fallbackJson)) {
    return (fallbackJson as CompletionCriterion[]).filter(
      (c) => c && typeof c === "object" && typeof c.label === "string",
    );
  }
  return [];
}

/**
 * Mirror first-class tasks into work_orders.completion_criteria so legacy
 * readers and the dual-write era stay consistent.
 */
export async function mirrorTasksToCompletionCriteria(
  client: PoolClient,
  workOrderId: string,
  accountId: string,
): Promise<CompletionCriterion[]> {
  const tasks = await loadWorkOrderTasks(client, workOrderId, accountId);
  const criteria = tasksToCriteria(tasks);
  await client.query(
    `UPDATE work_orders SET completion_criteria = $3::jsonb, updated_at = now()
      WHERE id = $1 AND account_id = $2`,
    [workOrderId, accountId, JSON.stringify(criteria)],
  );
  return criteria;
}

/**
 * Apply checklist toggles to first-class tasks (by id). Unknown ids ignored.
 * Mirrors the result into completion_criteria JSONB.
 */
export async function applyTaskCompletionToggles(
  client: PoolClient,
  opts: {
    workOrderId: string;
    accountId: string;
    toggles: Array<{ id: string; completed: boolean }>;
  },
): Promise<CompletionCriterion[]> {
  for (const t of opts.toggles) {
    await client.query(
      `UPDATE work_order_tasks
          SET completed = $3,
              completed_at = CASE WHEN $3 THEN COALESCE(completed_at, now()) ELSE NULL END,
              status = CASE WHEN $3 THEN 'done' ELSE 'open' END,
              updated_at = now()
        WHERE id = $1 AND work_order_id = $2 AND account_id = $4`,
      [t.id, opts.workOrderId, t.completed, opts.accountId],
    );
  }
  return mirrorTasksToCompletionCriteria(client, opts.workOrderId, opts.accountId);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Full checklist replace from the office form (labels + required + completed).
 * - Existing task UUIDs are updated in place (preserves activity_entries.task_id).
 * - Client-temp ids (`c-…`) or unknown ids become new task rows.
 * - Tasks removed from the list are deleted only when they have no timed activity.
 * Always mirrors into completion_criteria.
 */
export async function syncWorkOrderTasksFromCriteriaList(
  client: PoolClient,
  opts: {
    workOrderId: string;
    accountId: string;
    criteria: unknown;
    source?: "estimate" | "manual" | "ai";
  },
): Promise<CompletionCriterion[]> {
  type CriteriaRow = CriteriaJsonItem & { id?: string };
  const items: CriteriaRow[] = Array.isArray(opts.criteria)
    ? (opts.criteria as CriteriaRow[])
    : [];
  const existing = await loadWorkOrderTasks(client, opts.workOrderId, opts.accountId);
  const byId = new Map(existing.map((t) => [t.id, t]));
  const kept = new Set<string>();
  const source = opts.source ?? "manual";
  let sort = 0;

  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const label = String(raw.label ?? raw.description ?? "").trim();
    if (!label) continue;
    const required = raw.required !== false;
    const completed = Boolean(raw.completed ?? raw.done ?? false);
    const id = typeof raw.id === "string" ? raw.id : "";
    const isUuid = UUID_RE.test(id);

    if (isUuid && byId.has(id)) {
      await client.query(
        `UPDATE work_order_tasks
            SET label = $3, required = $4, completed = $5,
                completed_at = CASE WHEN $5 THEN COALESCE(completed_at, now()) ELSE NULL END,
                status = CASE WHEN $5 THEN 'done' ELSE 'open' END,
                sort_order = $6, updated_at = now()
          WHERE id = $1 AND work_order_id = $2 AND account_id = $7`,
        [id, opts.workOrderId, label, required, completed, sort, opts.accountId],
      );
      kept.add(id);
    } else {
      const ins = await client.query<{ id: string }>(
        `INSERT INTO work_order_tasks
           (account_id, work_order_id, label, required, completed, completed_at, status, sort_order, source)
         VALUES ($1,$2,$3,$4,$5, CASE WHEN $5 THEN now() END, CASE WHEN $5 THEN 'done' ELSE 'open' END, $6, $7)
         RETURNING id`,
        [opts.accountId, opts.workOrderId, label, required, completed, sort, source],
      );
      kept.add(ins.rows[0].id);
    }
    sort += 1;
  }

  for (const t of existing) {
    if (kept.has(t.id)) continue;
    const timed = await client.query(
      `SELECT 1 FROM activity_entries WHERE task_id = $1 AND account_id = $2 LIMIT 1`,
      [t.id, opts.accountId],
    );
    if ((timed.rowCount ?? 0) > 0) continue; // keep historical baseline rows
    await client.query(
      `DELETE FROM work_order_tasks WHERE id = $1 AND account_id = $2`,
      [t.id, opts.accountId],
    );
  }

  return mirrorTasksToCompletionCriteria(client, opts.workOrderId, opts.accountId);
}
