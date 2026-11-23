import type { ChecklistRow } from "@/lib/estimates/baseline";

/** What a draft still needs before it can be sent (TASK-194). Each row links to its field. */
export function BeforeSendChecklist({ rows }: { rows: ChecklistRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div
      data-testid="before-send-checklist"
      style={{
        border: "1px solid color-mix(in srgb, var(--color-warning) 40%, transparent)",
        borderRadius: "var(--radius)",
        padding: "var(--space-3)",
        marginBottom: "var(--space-3)",
      }}
    >
      <strong style={{ fontSize: "var(--text-sm)" }}>Before you can send</strong>
      <ul style={{ margin: "var(--space-2) 0 0", paddingLeft: "var(--space-4)", fontSize: "var(--text-sm)" }}>
        {rows.map((row) => (
          <li key={row.key} data-testid="before-send-row">
            <a href={row.href} style={{ color: "var(--accent)" }}>{row.label}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
