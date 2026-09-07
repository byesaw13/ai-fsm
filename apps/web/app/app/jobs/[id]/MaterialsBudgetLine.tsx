import { formatCents } from "@ai-fsm/money";

export type MaterialsBudgetCopy =
  | { kind: "empty" }
  | { kind: "spent_only"; spentLabel: string }
  | {
      kind: "compare";
      allowanceLabel: string;
      spentLabel: string;
      varianceLabel: string;
    };

/** Copy for the budget line. Spend still shows when there is no allowance. */
export function materialsBudgetCopy(
  allowanceCents: number | null | undefined,
  spentCents: number,
): MaterialsBudgetCopy {
  if (allowanceCents == null) {
    if (spentCents <= 0) return { kind: "empty" };
    return { kind: "spent_only", spentLabel: formatCents(spentCents) };
  }
  const variance = allowanceCents - spentCents;
  return {
    kind: "compare",
    allowanceLabel: formatCents(allowanceCents),
    spentLabel: formatCents(spentCents),
    varianceLabel:
      variance >= 0
        ? `${formatCents(variance)} remaining`
        : `${formatCents(-variance)} over`,
  };
}

/**
 * Materials budget at a glance: allowance vs spent vs remaining/over. Shared by
 * the project hub's Materials summary and the Materials page Purchases tab so
 * both read the same (TASK-121, one coherent materials & spend view).
 * Renders nothing only when there is neither an allowance nor any spend.
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
  const copy = materialsBudgetCopy(allowanceCents, spentCents);
  if (copy.kind === "empty") return null;
  return (
    <p
      style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}
      data-testid={testId}
    >
      {copy.kind === "spent_only" ? (
        <>Spent {copy.spentLabel}</>
      ) : (
        <>
          Allowance {copy.allowanceLabel}
          {" · "}Spent {copy.spentLabel}
          {" · "}
          {copy.varianceLabel}
        </>
      )}
    </p>
  );
}
