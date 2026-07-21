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
