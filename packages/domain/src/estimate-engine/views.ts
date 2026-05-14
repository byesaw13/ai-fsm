import type {
  ComputedLineItem,
  EstimateSummary,
  InternalSummary,
  RuleAuditEntry,
  GuardrailWarning,
  ClientView,
  InternalView,
} from "./types";

interface ResultCore {
  lineItems: ComputedLineItem[];
  summary: EstimateSummary;
  internalSummary: InternalSummary;
  audit: RuleAuditEntry[];
  warnings: GuardrailWarning[];
}

export function buildClientView(core: ResultCore): ClientView {
  return {
    lineItems: core.lineItems
      .filter((l) => l.visibleToCustomer)
      .map(({ id, description, quantity, unit, totalCents, visibleToCustomer }) => ({
        id,
        description,
        quantity,
        unit,
        totalCents,
        visibleToCustomer,
      })),
    summary: {
      subtotal: core.summary.subtotalCents,
      adjustments: core.summary.adjustmentsCents,
      total: core.summary.totalCents,
      depositDue: core.summary.depositCents,
      balanceDue: core.summary.balanceDueCents,
    },
  };
}

export function buildInternalView(core: ResultCore): InternalView {
  return {
    lineItems: core.lineItems,
    summary: core.summary,
    internalSummary: core.internalSummary,
    audit: core.audit,
    warnings: core.warnings,
  };
}
