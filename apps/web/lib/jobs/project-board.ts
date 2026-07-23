/**
 * Project job-board helpers: day task chips + unplanned work.
 */

export type PlannedTaskChip = {
  id: string;
  label: string;
  completed: boolean;
  status: string;
};

export type VisitPlanDay = {
  visitId: string;
  label: string;
  status: string;
  /** Existing planned task ids (for merge on plan) */
  plannedTaskIds: string[];
};

export type UnplannedTask = {
  id: string;
  label: string;
  required: boolean;
  status: string;
  work_order_id: string;
  work_order_title: string | null;
};

/** Group planned visit_tasks rows by visit_id. */
export function groupPlannedTasksByVisit(
  rows: Array<{
    visit_id: string;
    task_id: string;
    label: string;
    completed: boolean;
    status: string;
  }>,
): Map<string, PlannedTaskChip[]> {
  const map = new Map<string, PlannedTaskChip[]>();
  for (const r of rows) {
    const list = map.get(r.visit_id) ?? [];
    list.push({
      id: r.task_id,
      label: r.label,
      completed: r.completed || r.status === "done",
      status: r.status,
    });
    map.set(r.visit_id, list);
  }
  return map;
}

/**
 * Open tasks that are not planned on any visit yet.
 * A task planned on a past day still counts as "planned" (not unplanned).
 */
export function findUnplannedOpenTasks(
  openTasks: Array<{
    id: string;
    label: string;
    required: boolean;
    status: string;
    work_order_id: string;
    work_order_title: string | null;
  }>,
  plannedTaskIds: Iterable<string>,
): UnplannedTask[] {
  const planned = new Set(plannedTaskIds);
  return openTasks
    .filter((t) => !planned.has(t.id) && t.status !== "done")
    .map((t) => ({
      id: t.id,
      label: t.label,
      required: t.required,
      status: t.status,
      work_order_id: t.work_order_id,
      work_order_title: t.work_order_title,
    }));
}

/**
 * Task ids that count as "planned" — only those on a usable field day (the
 * same visit set as the day picker). A task planned on a cancelled or
 * assessment visit must fall back to Unplanned so it can be reassigned.
 */
export function plannedTaskIdsOnDays(
  rows: Array<{ visit_id: string; task_id: string }>,
  fieldDayVisitIds: Iterable<string>,
): string[] {
  const allowed = new Set(fieldDayVisitIds);
  return rows.filter((r) => allowed.has(r.visit_id)).map((r) => r.task_id);
}

/**
 * Deliverable task counts per work order. Callers pass tasks already filtered
 * to deliverables (taskProgress.tasks) so pricing/allowance rows never count.
 */
export function deliverableCountsByWorkOrder(
  tasks: Array<{ work_order_id: string; completed: boolean; status: string }>,
): Map<string, { total: number; open: number }> {
  const map = new Map<string, { total: number; open: number }>();
  for (const t of tasks) {
    const agg = map.get(t.work_order_id) ?? { total: 0, open: 0 };
    agg.total += 1;
    if (!t.completed && t.status !== "done") agg.open += 1;
    map.set(t.work_order_id, agg);
  }
  return map;
}

/** Short chip label for timeline (avoid wrapping walls of text). */
export function truncateTaskChipLabel(label: string, max = 42): string {
  const t = label.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/**
 * Merge a task onto a day's plan without dropping existing planned ids.
 * Done tasks are never re-added (caller should only pass open/partial).
 */
export function mergeTaskOntoDayPlan(existingIds: string[], taskId: string): string[] {
  const set = new Set(existingIds.filter(Boolean));
  set.add(taskId);
  return [...set];
}
