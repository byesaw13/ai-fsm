/**
 * Job Ledger — customer commercial spine (estimate vs actual).
 * Pure projection: no DB I/O. See docs/superpowers/specs/2026-07-30-job-ledger-design.md
 */

import { LABOR_CUSTOMER_RATE_CENTS_PER_HOUR } from "./dovetails";

export const EXPENSE_COMMERCIAL_TAGS = [
  "in_allowance",
  "supply_gap",
  "scope_add",
  "equipment",
] as const;

export type ExpenseCommercialTag = (typeof EXPENSE_COMMERCIAL_TAGS)[number];

export type JobLedgerBucket = "labor" | "materials" | "equipment" | "other";

export type JobLedgerLineInput = {
  description: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
  line_item_type?: string | null;
};

export type JobLedgerExpenseInput = {
  amount_cents: number;
  commercial_tag?: ExpenseCommercialTag | string | null;
  category?: string | null;
  notes?: string | null;
  vendor_name?: string | null;
};

export type JobLedgerChangeOrderInput = {
  id: string;
  title: string;
  status: string;
  total_cents: number;
  /** Prefer pretax subtotal when present so sold/actual stay consistent. */
  subtotal_cents?: number;
};

export type JobLedgerInput = {
  jobId: string;
  pricingMode: "flat_rate" | "hourly_internal" | null;
  estimate: {
    id: string;
    number: string | null;
    status: string;
    /** Prefer pretax commercial total (subtotal); falls back to total_cents. */
    total_cents: number;
    subtotal_cents?: number | null;
    tax_cents?: number | null;
    line_items: JobLedgerLineInput[];
  } | null;
  /** Closed job_work minutes (actual, not quarter-rounded). */
  trackedLaborMinutes: number;
  materialsExpenses: JobLedgerExpenseInput[];
  /** Non-materials expenses that may contribute to equipment (optional). */
  otherExpenses?: JobLedgerExpenseInput[];
  changeOrders: JobLedgerChangeOrderInput[];
  /**
   * Cash collected on the job. Prefer pretax-allocated paid amounts when tax is
   * nonzero so balance stays on a pretax basis with actuals.
   */
  paidCents: number;
  /** Override customer labor rate; default domain constant. */
  customerLaborRateCentsPerHour?: number;
};

export type JobLedgerRow = {
  bucket: JobLedgerBucket;
  label: string;
  estimateCents: number | null;
  estimateHours: number | null;
  estimateCapHours: number | null;
  actualCents: number;
  actualHours: number | null;
  varianceCents: number | null;
  rateCentsPerHour: number | null;
};

export type JobLedgerSummary = {
  jobId: string;
  estimateId: string | null;
  estimateNumber: string | null;
  estimateStatus: string | null;
  pricingMode: "flat_rate" | "hourly_internal" | null;
  soldCents: number | null;
  actualCents: number;
  paidCents: number;
  balanceCents: number;
  rows: JobLedgerRow[];
  changeOrders: JobLedgerChangeOrderInput[];
  /** Materials overage (and optional labor over budget) for CO prefill. */
  suggestedCoCents: number;
  suggestedCoLines: {
    description: string;
    quantity: number;
    unit_price_cents: number;
  }[];
  canDraftCo: boolean;
};

const LIFT_OR_EQUIPMENT =
  /\b(lift|scaffold|equipment\s+rental|rental\s+fees|boom|scissor)\b/i;
const MATERIALS_ALLOWANCE = /\bmaterials?\s+allowance\b|\ballowance\b.*\bmaterials?\b/i;
const LABOR_BUDGET =
  /\b(t\s*&\s*m|time[\s-]?and[\s-]?materials|labor\s*[—–\-:]|hours?\s*@|\/\s*hr|estimated\s+(on-site\s+)?labor|budget)\b/i;
const CAP_HOURS = /maximum\s+authorized[:\s]*(\d+(?:\.\d+)?)\s*hours?/i;
const HOURS_IN_TEXT = /(\d+(?:\.\d+)?)\s*hours?\b/i;

export function classifyEstimateLineBucket(
  line: JobLedgerLineInput,
): JobLedgerBucket {
  const desc = line.description ?? "";
  const type = (line.line_item_type ?? "").toLowerCase();

  if (LIFT_OR_EQUIPMENT.test(desc)) return "equipment";
  if (type === "materials" || MATERIALS_ALLOWANCE.test(desc)) return "materials";
  if (type === "labor" || LABOR_BUDGET.test(desc)) return "labor";
  if (type === "materials") return "materials";
  if (type === "handling_fee" || type === "adjustment") return "other";
  // Allowance without materials keyword often still materials for T&M packages
  if (/\ballowance\b/i.test(desc) && !LIFT_OR_EQUIPMENT.test(desc)) {
    return "materials";
  }
  return "other";
}

export function parseCapHoursFromDescription(description: string): number | null {
  const m = description.match(CAP_HOURS);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseBudgetHoursFromLine(line: JobLedgerLineInput): number | null {
  const qty = Number(line.quantity);
  if (Number.isFinite(qty) && qty > 0 && qty <= 500) {
    // Prefer quantity when it looks like hours (T&M labor lines)
    if (line.unit_price_cents > 0 && (line.line_item_type === "labor" || LABOR_BUDGET.test(line.description))) {
      return qty;
    }
  }
  const m = line.description.match(HOURS_IN_TEXT);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

export function trackedHoursFromMinutes(minutes: number): number {
  if (minutes <= 0) return 0;
  return Math.round((minutes / 60) * 100) / 100;
}

export function billableLaborCents(
  minutes: number,
  rateCentsPerHour: number,
): number {
  if (minutes <= 0 || rateCentsPerHour <= 0) return 0;
  return Math.round((minutes / 60) * rateCentsPerHour);
}

/**
 * FIFO-tag materials dollars against allowance: first N cents → in_allowance,
 * remainder → supply_gap. Does not mutate input; returns parallel tags.
 */
export function assignAllowanceTags(
  amountsCents: number[],
  allowanceCents: number,
): ExpenseCommercialTag[] {
  let remaining = Math.max(0, allowanceCents);
  return amountsCents.map((amount) => {
    if (amount <= 0) return "in_allowance";
    if (remaining <= 0) return "supply_gap";
    if (amount <= remaining) {
      remaining -= amount;
      return "in_allowance";
    }
    // Partial: treat whole receipt as supply_gap once over (simple v1)
    remaining = 0;
    return "supply_gap";
  });
}

function sumExpenses(
  expenses: JobLedgerExpenseInput[],
  predicate: (e: JobLedgerExpenseInput) => boolean,
): number {
  return expenses.reduce((sum, e) => (predicate(e) ? sum + e.amount_cents : sum), 0);
}

function isEquipmentExpense(e: JobLedgerExpenseInput): boolean {
  if (e.commercial_tag === "equipment") return true;
  const blob = `${e.notes ?? ""} ${e.vendor_name ?? ""} ${e.category ?? ""}`;
  return LIFT_OR_EQUIPMENT.test(blob);
}

export function buildJobLedger(input: JobLedgerInput): JobLedgerSummary {
  const rate =
    input.customerLaborRateCentsPerHour ?? LABOR_CUSTOMER_RATE_CENTS_PER_HOUR;
  const lines = input.estimate?.line_items ?? [];

  let laborEstimateCents: number | null = null;
  let laborEstimateHours: number | null = null;
  let laborCapHours: number | null = null;
  let laborRate = rate;
  let materialsEstimateCents: number | null = null;
  let equipmentEstimateCents: number | null = null;
  let otherEstimateCents = 0;

  for (const line of lines) {
    const bucket = classifyEstimateLineBucket(line);
    if (bucket === "labor") {
      laborEstimateCents = (laborEstimateCents ?? 0) + line.total_cents;
      const hrs = parseBudgetHoursFromLine(line);
      if (hrs != null) {
        laborEstimateHours = (laborEstimateHours ?? 0) + hrs;
      }
      const cap = parseCapHoursFromDescription(line.description);
      if (cap != null) {
        laborCapHours = laborCapHours == null ? cap : Math.max(laborCapHours, cap);
      }
      if (line.unit_price_cents > 0) {
        laborRate = line.unit_price_cents;
      }
    } else if (bucket === "materials") {
      materialsEstimateCents = (materialsEstimateCents ?? 0) + line.total_cents;
    } else if (bucket === "equipment") {
      equipmentEstimateCents = (equipmentEstimateCents ?? 0) + line.total_cents;
    } else {
      otherEstimateCents += line.total_cents;
    }
  }

  // Fallback: if no classified lines but estimate total exists, leave buckets null
  // and rely on sold = estimate total + COs.

  const actualHours = trackedHoursFromMinutes(input.trackedLaborMinutes);
  const laborActualCents =
    input.pricingMode === "flat_rate"
      ? 0 // flat: labor actual not on customer ledger by default
      : billableLaborCents(input.trackedLaborMinutes, laborRate);

  // Materials receipts exclude equipment-tagged / lift-heuristic rows
  const materialsOnlyCents = sumExpenses(
    input.materialsExpenses,
    (e) => e.commercial_tag !== "equipment" && !isEquipmentExpense(e),
  );
  const equipmentFromMaterials = sumExpenses(
    input.materialsExpenses,
    (e) => e.commercial_tag === "equipment" || isEquipmentExpense(e),
  );
  const equipmentFromOther = sumExpenses(input.otherExpenses ?? [], isEquipmentExpense);
  const equipmentActualCents = equipmentFromMaterials + equipmentFromOther;
  const materialsActualForRow = materialsOnlyCents;

  const approvedCos = input.changeOrders.filter((co) => co.status === "approved");
  const draftCos = input.changeOrders.filter((co) => co.status === "draft");
  const approvedCoTotal = approvedCos.reduce(
    (s, co) => s + (co.subtotal_cents ?? co.total_cents),
    0,
  );

  // Prefer pretax commercial base so actuals (rates × hours, receipts) align.
  const estimateBase =
    input.estimate == null
      ? null
      : input.estimate.subtotal_cents != null && input.estimate.subtotal_cents > 0
        ? input.estimate.subtotal_cents
        : input.estimate.total_cents;
  const soldCents =
    estimateBase != null
      ? estimateBase + approvedCoTotal
      : approvedCoTotal > 0
        ? approvedCoTotal
        : null;

  const showLaborOnLedger = input.pricingMode !== "flat_rate";

  const rows: JobLedgerRow[] = [];

  if (showLaborOnLedger || laborEstimateCents != null || actualHours > 0) {
    const estC = laborEstimateCents;
    const actC = showLaborOnLedger ? laborActualCents : 0;
    rows.push({
      bucket: "labor",
      label: "Labor",
      estimateCents: estC,
      estimateHours: laborEstimateHours,
      estimateCapHours: laborCapHours,
      actualCents: actC,
      actualHours: showLaborOnLedger ? actualHours : null,
      varianceCents: estC != null ? actC - estC : null,
      rateCentsPerHour: laborRate,
    });
  }

  if (
    materialsEstimateCents != null ||
    materialsActualForRow > 0 ||
    input.materialsExpenses.length > 0
  ) {
    const estC = materialsEstimateCents;
    const actC = materialsActualForRow;
    rows.push({
      bucket: "materials",
      label: "Materials",
      estimateCents: estC,
      estimateHours: null,
      estimateCapHours: null,
      actualCents: actC,
      actualHours: null,
      varianceCents: estC != null ? actC - estC : null,
      rateCentsPerHour: null,
    });
  }

  if (equipmentEstimateCents != null || equipmentActualCents > 0) {
    const estC = equipmentEstimateCents;
    const actC = equipmentActualCents;
    rows.push({
      bucket: "equipment",
      label: "Lift / equipment",
      estimateCents: estC,
      estimateHours: null,
      estimateCapHours: null,
      actualCents: actC,
      actualHours: null,
      varianceCents: estC != null ? actC - estC : null,
      rateCentsPerHour: null,
    });
  }

  if (otherEstimateCents > 0) {
    rows.push({
      bucket: "other",
      label: "Other (estimate)",
      estimateCents: otherEstimateCents,
      estimateHours: null,
      estimateCapHours: null,
      actualCents: 0,
      actualHours: null,
      varianceCents: -otherEstimateCents,
      rateCentsPerHour: null,
    });
  }

  const actualCents = rows.reduce((s, r) => s + r.actualCents, 0);
  const paidCents = Math.max(0, input.paidCents);
  // Flat rate: always contract sold − paid (receipts do not redefine the balance).
  // T&M: live actual − paid.
  const balanceBase =
    input.pricingMode === "flat_rate" && soldCents != null ? soldCents : actualCents;
  const balanceCents = balanceBase - paidCents;

  // Variance already covered by approved COs (pretax) should not re-suggest.
  // Draft COs block another draft so we don't mint duplicates for the same actuals.
  let remainingVarianceCover = approvedCoTotal;

  const suggestedCoLines: JobLedgerSummary["suggestedCoLines"] = [];
  const materialsRow = rows.find((r) => r.bucket === "materials");
  if (
    materialsRow?.estimateCents != null &&
    materialsRow.actualCents > materialsRow.estimateCents
  ) {
    let over = materialsRow.actualCents - materialsRow.estimateCents;
    const covered = Math.min(over, remainingVarianceCover);
    over -= covered;
    remainingVarianceCover -= covered;
    if (over > 0) {
      suggestedCoLines.push({
        description:
          "Materials over allowance — actual materials purchased to complete scope",
        quantity: 1,
        unit_price_cents: over,
      });
    }
  }
  const laborRow = rows.find((r) => r.bucket === "labor");
  if (
    showLaborOnLedger &&
    laborRow?.estimateCents != null &&
    laborRow.actualCents > laborRow.estimateCents
  ) {
    let over = laborRow.actualCents - laborRow.estimateCents;
    const covered = Math.min(over, remainingVarianceCover);
    over -= covered;
    remainingVarianceCover -= covered;
    if (over > 0) {
      suggestedCoLines.push({
        description: `Labor over T&M budget (${laborRow.actualHours ?? 0} hrs actual vs budget)`,
        quantity: 1,
        unit_price_cents: over,
      });
    }
  }

  const suggestedCoCents = suggestedCoLines.reduce(
    (s, l) => s + Math.round(l.quantity * l.unit_price_cents),
    0,
  );

  const canDraftCo =
    input.estimate?.status === "approved" &&
    suggestedCoLines.length > 0 &&
    suggestedCoCents > 0 &&
    draftCos.length === 0;

  return {
    jobId: input.jobId,
    estimateId: input.estimate?.id ?? null,
    estimateNumber: input.estimate?.number ?? null,
    estimateStatus: input.estimate?.status ?? null,
    pricingMode: input.pricingMode,
    soldCents,
    actualCents,
    paidCents,
    balanceCents,
    rows,
    changeOrders: input.changeOrders,
    suggestedCoCents,
    suggestedCoLines,
    canDraftCo,
  };
}
