/**
 * Project page overview helpers — WO mismatch detection + field-visit pickers.
 * Keeps job detail page wiring thin and unit-testable.
 */

export type WorkOrderBoardRow = {
  id: string;
  title: string;
  status: string;
  visit_count: number;
  active_visit_count: number;
  task_total: number;
  task_open: number;
};

export type TaskScheduleMismatch = {
  /** WO that owns most calendar field days (visits) */
  calendarWo: WorkOrderBoardRow;
  /** WO that owns open deliverable tasks */
  tasksWo: WorkOrderBoardRow;
  message: string;
};

/**
 * Calendar on empty-task WO + open tasks on another WO — the dual-WO trap.
 * Prefer the WO with the most visits as "calendar"; the WO with most open tasks as "tasks".
 */
export function detectTaskScheduleMismatch(
  workOrders: WorkOrderBoardRow[],
): TaskScheduleMismatch | null {
  if (workOrders.length < 2) return null;

  const withVisits = workOrders
    .filter((w) => w.visit_count > 0)
    .sort((a, b) => b.visit_count - a.visit_count || b.active_visit_count - a.active_visit_count);
  const withOpenTasks = workOrders
    .filter((w) => w.task_open > 0)
    .sort((a, b) => b.task_open - a.task_open || b.task_total - a.task_total);

  const calendarWo = withVisits[0];
  const tasksWo = withOpenTasks[0];
  if (!calendarWo || !tasksWo) return null;
  if (calendarWo.id === tasksWo.id) return null;
  // Only warn when the calendar packet has no open tasks to plan
  if (calendarWo.task_open > 0) return null;

  return {
    calendarWo,
    tasksWo,
    message: `Field days are on “${calendarWo.title}” (no open tasks), but open work lives on “${tasksWo.title}” (${tasksWo.task_open} open). Schedule or re-link days to the work order that has the checklist.`,
  };
}

/** Best assessment visit: open site_visit first, else most recent completed site_visit. */
export function pickAssessmentVisitId(
  visits: Array<{ id: string; visit_type: string; status: string; scheduled_start: string | Date }>,
): string | null {
  const site = visits.filter((v) => v.visit_type === "site_visit");
  const open = site.find((v) => !["completed", "cancelled"].includes(v.status));
  if (open) return open.id;
  const completed = site
    .filter((v) => v.status === "completed")
    .sort(
      (a, b) =>
        new Date(b.scheduled_start).getTime() - new Date(a.scheduled_start).getTime(),
    );
  return completed[0]?.id ?? null;
}

/** Next field day for dock: first non-terminal execution visit, else latest completed execution. */
export function pickNextExecutionVisit(
  visits: Array<{
    id: string;
    visit_type: string;
    status: string;
    scheduled_start: string | Date;
  }>,
): { id: string; label: string } | null {
  const exec = visits.filter(
    (v) => v.visit_type === "standard" || v.visit_type === "punch_list",
  );
  const open = exec
    .filter((v) => !["completed", "cancelled"].includes(v.status))
    .sort(
      (a, b) =>
        new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime(),
    );
  if (open[0]) {
    const d = new Date(open[0].scheduled_start);
    const label = d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
    return { id: open[0].id, label };
  }
  const done = exec
    .filter((v) => v.status === "completed")
    .sort(
      (a, b) =>
        new Date(b.scheduled_start).getTime() - new Date(a.scheduled_start).getTime(),
    );
  if (done[0]) {
    const d = new Date(done[0].scheduled_start);
    const label = `Latest · ${d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    })}`;
    return { id: done[0].id, label };
  }
  return null;
}
