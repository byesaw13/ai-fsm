/**
 * Prefill change-order payload from Job Ledger variance (pure).
 */
import type { JobLedgerSummary } from "@ai-fsm/domain";

export type CoDraftPayload = {
  estimate_id: string;
  title: string;
  description: string;
  notes: string;
  tax_rate: number;
  line_items: {
    description: string;
    quantity: number;
    unit_price_cents: number;
    sort_order: number;
  }[];
};

export function buildCoDraftFromLedger(ledger: JobLedgerSummary): CoDraftPayload | null {
  if (!ledger.estimateId || !ledger.canDraftCo || ledger.suggestedCoLines.length === 0) {
    return null;
  }

  const materials = ledger.rows.find((r) => r.bucket === "materials");
  const labor = ledger.rows.find((r) => r.bucket === "labor");

  const descriptionLines = [
    `This Change Order amends ${ledger.estimateNumber ?? "the approved estimate"} for materials and/or labor cost adjustments based on actual field conditions.`,
    "",
    "Original commercial assumptions:",
  ];
  if (materials?.estimateCents != null) {
    descriptionLines.push(
      `• Materials allowance: $${(materials.estimateCents / 100).toFixed(2)}`,
      `• Materials actual (receipts): $${(materials.actualCents / 100).toFixed(2)}`,
    );
  }
  if (labor?.estimateHours != null) {
    descriptionLines.push(
      `• Labor budget: ${labor.estimateHours} hrs @ $${((labor.rateCentsPerHour ?? 0) / 100).toFixed(2)}/hr`,
      `• Labor actual: ${labor.actualHours ?? 0} hrs`,
    );
    if (labor.estimateCapHours != null) {
      descriptionLines.push(`• Labor cap: ${labor.estimateCapHours} hrs without further written approval`);
    }
  }
  descriptionLines.push(
    "",
    "Condition / reason:",
    "Materials and/or labor required to complete the contracted scope differ from the original allowance/budget. Itemized receipts and time records are available in the project Job Ledger.",
  );

  const notes = [
    `Source: job ledger variance on job ${ledger.jobId}`,
    `Suggested total: $${(ledger.suggestedCoCents / 100).toFixed(2)}`,
    `Generated: ${new Date().toISOString().slice(0, 10)}`,
  ].join("\n");

  const hasMaterialsOverage = ledger.suggestedCoLines.some((l) =>
    /materials/i.test(l.description),
  );

  return {
    estimate_id: ledger.estimateId,
    title: hasMaterialsOverage
      ? "Materials supply / cost adjustment"
      : "Labor / cost adjustment from actuals",
    description: descriptionLines.join("\n"),
    notes,
    tax_rate: 0,
    line_items: ledger.suggestedCoLines.map((line, i) => ({
      description: line.description,
      quantity: line.quantity,
      unit_price_cents: line.unit_price_cents,
      sort_order: i,
    })),
  };
}
