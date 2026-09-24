/**
 * "Work completed" summary for an invoice (TASK-157), built from the job's
 * finished work-order tasks. Task labels follow `Area — task`; tasks are
 * grouped by area in first-seen order. The owner edits the result before
 * sending, so this only has to be a good first draft.
 */

export type WorkSummaryTask = {
  label: string;
  status: string;
  parent_task_id: string | null;
};

// Em dash (the app's convention), en dash, or spaced hyphen.
const AREA_SEPARATOR = /\s+[—–-]\s+/;

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function buildWorkSummaryFromTasks(tasks: WorkSummaryTask[]): string {
  const areas = new Map<string, string[]>();
  for (const task of tasks) {
    // Child tasks are split-off remainders of a parent ("all of it"), not work lines.
    if (task.status !== "done" || task.parent_task_id) continue;
    const label = task.label.trim();
    if (!label) continue;
    const parts = label.split(AREA_SEPARATOR);
    const area = parts.length > 1 ? parts[0].trim() : "General";
    const item = capitalize((parts.length > 1 ? parts.slice(1).join(" — ") : label).trim());
    const list = areas.get(area) ?? [];
    if (!list.includes(item)) list.push(item);
    areas.set(area, list);
  }
  return [...areas.entries()]
    .map(([area, items]) => [area, ...items.map((i) => `• ${i}`)].join("\n"))
    .join("\n\n");
}
