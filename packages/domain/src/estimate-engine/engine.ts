import type {
  EstimateSpec,
  EstimateResult,
  ComputedLineItem,
  EstimateSummary,
  InternalSummary,
  PricingRules,
} from "./types";
import { ENGINE_VERSION } from "./rules";
import { expandRooms, computePaintMaterials } from "./painting";
import { computeLineItems, computeHandlingLine } from "./general";
import { evaluateGuardrails } from "./guardrails";
import { buildClientView, buildInternalView } from "./views";

/**
 * Core computation function — pure, no I/O, no side effects.
 * Returns a complete EstimateResult with client and internal views.
 */
export function computeEstimate(spec: EstimateSpec, rules: PricingRules): EstimateResult {
  const audit = [];
  const allLines: ComputedLineItem[] = [];
  let totalLaborCostCents = 0;
  let totalMaterialCostCents = 0;

  // ── Painting: room-by-room surface expansion ──────────────────────────
  if (spec.rooms && spec.rooms.length > 0) {
    const quality = spec.paintQuality ?? "standard";
    const painting = expandRooms(spec.rooms, quality, rules);

    allLines.push(...painting.lineItems);
    audit.push(...painting.audit);
    totalLaborCostCents += painting.laborCostCents;

    if (painting.totalGallons > 0) {
      const mats = computePaintMaterials(painting.totalGallons, quality, rules);
      allLines.push(mats.materialLine);
      allLines.push(mats.handlingLine);
      audit.push(mats.auditEntry);
      totalMaterialCostCents += mats.materialCents;
    }
  }

  // ── General: explicit line items ──────────────────────────────────────
  if (spec.lineItems && spec.lineItems.length > 0) {
    const general = computeLineItems(spec.lineItems, rules);

    allLines.push(...general.lineItems);
    audit.push(...general.audit);
    totalLaborCostCents += general.laborCostCents;
    totalMaterialCostCents += general.totalMaterialCents;

    if (general.totalMaterialCents > 0) {
      const handlingLine = computeHandlingLine(general.totalMaterialCents, rules.materialHandlingRate);
      allLines.push(handlingLine);
      audit.push({
        rule: "material.handling",
        input: { materialCents: general.totalMaterialCents, rate: rules.materialHandlingRate },
        output: { handlingCents: handlingLine.totalCents },
      });
    }
  }

  // ── Adjustments ───────────────────────────────────────────────────────
  for (const adj of spec.adjustments ?? []) {
    allLines.push({
      id: `adj-${adj.id}`,
      category: "adjustment",
      description: adj.label,
      quantity: 1,
      unit: "flat",
      unitAmountCents: adj.amountCents,
      totalCents: adj.amountCents,
      costBasisCents: 0,
      marginCents: adj.amountCents,
      sourceRule: `adjustment.${adj.type}`,
      visibleToCustomer: true,
    });
    audit.push({
      rule: `adjustment.${adj.type}`,
      input: { label: adj.label, amountCents: adj.amountCents },
      output: { amountCents: adj.amountCents },
    });
  }

  // ── Aggregate ─────────────────────────────────────────────────────────
  const laborCents = sumCategory(allLines, "labor");
  const materialCents = sumCategory(allLines, "material");
  const handlingCents = sumCategory(allLines, "handling");
  const adjustmentsCents = sumCategory(allLines, "adjustment");
  const subtotalCents = laborCents + materialCents + handlingCents;
  const totalCents = subtotalCents + adjustmentsCents;
  const depositCents = Math.round(totalCents * rules.depositRate);
  const balanceDueCents = totalCents - depositCents;

  const estimatedCostCents = totalLaborCostCents + totalMaterialCostCents;
  const grossMarginCents = totalCents - estimatedCostCents;
  const grossMarginPct = totalCents > 0 ? grossMarginCents / totalCents : 0;
  const effectiveLaborHours =
    rules.laborCostCentsPerHour > 0
      ? Math.round((totalLaborCostCents / rules.laborCostCentsPerHour) * 100) / 100
      : 0;

  const summary: EstimateSummary = {
    laborCents,
    materialCents,
    handlingCents,
    subtotalCents,
    adjustmentsCents,
    totalCents,
    depositCents,
    balanceDueCents,
  };

  const internalSummary: InternalSummary = {
    estimatedCostCents,
    grossMarginCents,
    grossMarginPct,
    effectiveLaborHours,
  };

  // ── Guardrails ────────────────────────────────────────────────────────
  const lineItemCount =
    (spec.rooms?.flatMap((r) => r.surfaces).length ?? 0) +
    (spec.lineItems?.length ?? 0);
  const warnings = evaluateGuardrails(spec, totalCents, grossMarginPct, lineItemCount, rules);

  const core = { lineItems: allLines, summary, internalSummary, audit, warnings };

  return {
    specVersion: ENGINE_VERSION,
    rulesVersion: rules.version,
    computedAt: new Date().toISOString(),
    ...core,
    views: {
      client: buildClientView(core),
      internal: buildInternalView(core),
    },
  };
}

function sumCategory(lines: ComputedLineItem[], category: ComputedLineItem["category"]): number {
  return lines.filter((l) => l.category === category).reduce((s, l) => s + l.totalCents, 0);
}
