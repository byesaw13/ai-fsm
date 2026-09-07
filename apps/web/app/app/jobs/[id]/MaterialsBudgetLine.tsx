import { formatCents } from "@ai-fsm/money";

/**
 * Materials budget at a glance: allowance vs spent vs remaining/over. Shared by
 * the project hub's Materials summary and the Materials page Purchases tab so
 * both read the same (TASK-121, one coherent materials & spend view).
 * Renders nothing when there's no materials allowance to compare against.
 */
export function MaterialsBudgetLine({
  allowanceCents,
  spentCents,
  testId,
}: {
  allowanceCents: number | null | undefined;
  spentCents: number;
  testId?: string;
}) {
  if (allowanceCents == null) return null;
  const variance = allowanceCents - spentCents;
  return (
    <p
      style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}
      data-testid={testId}
    >
      Allowance {formatCents(allowanceCents)}
      {" · "}Spent {formatCents(spentCents)}
      {" · "}
      {variance >= 0 ? `${formatCents(variance)} remaining` : `${formatCents(-variance)} over`}
    </p>
  );
}
