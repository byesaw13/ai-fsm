import { MATERIAL_HANDLING_CLIENT_RATE } from "@ai-fsm/domain";

export type AccountSettingsSlice = {
  material_handling_pct?: number;
};

export const DEFAULT_MATERIAL_HANDLING_PCT = Math.round(MATERIAL_HANDLING_CLIENT_RATE * 100);

/** Account settings override; falls back to domain default (15%). */
export function materialHandlingRateFromSettings(
  settings?: AccountSettingsSlice | Record<string, unknown> | null,
): number {
  const pct = settings?.material_handling_pct;
  if (typeof pct === "number" && Number.isFinite(pct) && pct >= 0 && pct <= 100) {
    return pct / 100;
  }
  return MATERIAL_HANDLING_CLIENT_RATE;
}

export function materialHandlingLineDescription(rate: number): string {
  return `Material handling (${Math.round(rate * 100)}%)`;
}

export function materialHandlingCents(materialCostCents: number, rate?: number): number {
  const r = rate ?? MATERIAL_HANDLING_CLIENT_RATE;
  if (materialCostCents <= 0 || r <= 0) return 0;
  return Math.round(materialCostCents * r);
}

export function materialInvoiceTotalCents(materialCostCents: number, rate?: number): number {
  return materialCostCents + materialHandlingCents(materialCostCents, rate);
}

export type LinkableMaterialExpense = {
  id: string;
  vendor_name: string;
  amount_cents: number;
  notes: string | null;
  expense_date: string;
  job_id: string | null;
  client_id: string | null;
  already_on_job: boolean;
  line_items?: ExpenseLineItemPreview[];
};

export type ExpenseLineItemPreview = {
  id: string;
  name: string;
  quantity: number;
  unit_cost_cents: number;
  line_total_cents: number;
};

/** "2026-09-20" → "Sep 20" (date-only, no timezone drift). "" if unparseable/absent. */
export function formatReceiptDate(dateStr?: string | null): string {
  if (!dateStr) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!m) return "";
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mon = MONTHS[Number(m[2]) - 1];
  return mon ? `${mon} ${Number(m[3])}` : "";
}

export function materialExpenseDescription(expense: {
  vendor_name: string;
  notes: string | null;
  expense_date?: string | null;
}): string {
  const detail = expense.notes?.trim();
  if (detail) return detail.length > 120 ? `${detail.slice(0, 117)}…` : detail;
  const vendor = expense.vendor_name?.trim() || "Supplier";
  const date = formatReceiptDate(expense.expense_date);
  return date ? `Materials — ${vendor} · ${date}` : `Materials — ${vendor}`;
}