/**
 * Itemized quotes already stored typed lines and a cost split (TASK-190).
 * These helpers keep later steps from putting that cost into the deposit
 * or from dropping the travel and risk amounts off the line list.
 */

/** Cents to add on top of materials-line prices. Zero when a materials line already carries the price. */
export function explicitMaterialDepositCents(input: {
  materialsLineCount: number;
  aggregateCents: number | null;
}): number {
  if (input.materialsLineCount > 0) return 0;
  return input.aggregateCents ?? 0;
}

/** Surcharge lines the total already includes and the line list does not. */
export function missingSurchargeLines(
  existingDescriptions: string[],
  travelCents: number,
  riskCents: number,
): { description: string; amountCents: number }[] {
  const have = new Set(existingDescriptions);
  const lines: { description: string; amountCents: number }[] = [];
  if (travelCents > 0 && !have.has("Travel surcharge")) {
    lines.push({ description: "Travel surcharge", amountCents: travelCents });
  }
  if (riskCents > 0 && !have.has("Risk adjustment")) {
    lines.push({ description: "Risk adjustment", amountCents: riskCents });
  }
  return lines;
}
