import type { LineItemSpec, ComputedLineItem, RuleAuditEntry, PricingRules } from "./types";

export interface GeneralOutput {
  lineItems: ComputedLineItem[];
  audit: RuleAuditEntry[];
  totalMaterialCents: number;
  laborCents: number;
  laborCostCents: number;
}

export function computeLineItems(items: LineItemSpec[], rules: PricingRules): GeneralOutput {
  const lineItems: ComputedLineItem[] = [];
  const audit: RuleAuditEntry[] = [];
  let totalMaterialCents = 0;
  let laborCents = 0;
  let laborCostCents = 0;

  for (const item of items) {
    const itemLaborCents = Math.round(item.quantity * item.unitLaborCents);
    const itemMaterialCents = item.materialCents ?? 0;

    // Internal cost: derive hours from billing rate, then apply cost rate
    const approxHours = rules.laborBillingCentsPerHour > 0
      ? itemLaborCents / rules.laborBillingCentsPerHour
      : 0;
    const itemCostCents = Math.round(approxHours * rules.laborCostCentsPerHour);

    const visible = item.visibleToCustomer ?? true;

    lineItems.push({
      id: `li-${item.id}`,
      category: "labor",
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unitAmountCents: item.unitLaborCents,
      totalCents: itemLaborCents,
      costBasisCents: itemCostCents,
      marginCents: itemLaborCents - itemCostCents,
      sourceRule: item.priceBookCode ? `pricebook.${item.priceBookCode}` : "explicit",
      visibleToCustomer: visible,
      ...(item.priceBookId ? { priceBookId: item.priceBookId } : {}),
    });

    if (itemMaterialCents > 0) {
      lineItems.push({
        id: `mat-${item.id}`,
        category: "material",
        description: `Materials — ${item.description}`,
        quantity: 1,
        unit: "flat",
        unitAmountCents: itemMaterialCents,
        totalCents: itemMaterialCents,
        costBasisCents: itemMaterialCents,
        marginCents: 0,
        sourceRule: "material.direct",
        visibleToCustomer: visible,
        ...(item.priceBookId ? { priceBookId: item.priceBookId } : {}),
      });
      totalMaterialCents += itemMaterialCents;
    }

    laborCents += itemLaborCents;
    laborCostCents += itemCostCents;

    audit.push({
      rule: item.priceBookCode ? `pricebook.${item.priceBookCode}` : "explicit",
      input: { qty: item.quantity, unitLaborCents: item.unitLaborCents, materialCents: item.materialCents },
      output: { laborCents: itemLaborCents, materialCents: itemMaterialCents, costCents: itemCostCents },
    });
  }

  return { lineItems, audit, totalMaterialCents, laborCents, laborCostCents };
}

export function computeHandlingLine(
  materialCents: number,
  rate: number
): ComputedLineItem {
  const handlingCents = Math.round(materialCents * rate);
  return {
    id: "handling",
    category: "handling",
    description: `Material handling (${Math.round(rate * 100)}%)`,
    quantity: 1,
    unit: "flat",
    unitAmountCents: handlingCents,
    totalCents: handlingCents,
    costBasisCents: 0,
    marginCents: handlingCents,
    sourceRule: "material.handling",
    visibleToCustomer: true,
  };
}
