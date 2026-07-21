/**
 * Flatten AI area groups into one task list for a single work order.
 * When the model still returns multiple groups, prefix task labels with the
 * group title so baselines stay readable without minting many work orders.
 */
export function flattenDecompositionTasks(
  groups: Array<{ title: string; scope: string; tasks: Array<{ label: string; required: boolean }> }>,
): {
  title: string;
  scope: string;
  tasks: Array<{ label: string; required: boolean }>;
} {
  if (groups.length === 1) {
    return {
      title: groups[0].title,
      scope: groups[0].scope,
      tasks: groups[0].tasks,
    };
  }
  const tasks = groups.flatMap((g) =>
    g.tasks.map((t) => ({
      label: t.label.toLowerCase().startsWith(g.title.toLowerCase())
        ? t.label
        : `${g.title} — ${t.label}`,
      required: t.required,
    })),
  );
  const scope = groups
    .map((g) => g.scope || g.title)
    .filter(Boolean)
    .join("; ");
  return {
    title: groups[0].title.includes(" / ")
      ? groups[0].title
      : groups.map((g) => g.title).join(" / ").slice(0, 200),
    scope: scope.slice(0, 2000),
    tasks,
  };
}
