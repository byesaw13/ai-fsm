import type { HoursSource, PreparedQuantity, PreparedScopeSummary, ScopeTaskKind } from "@ai-fsm/domain";

const QUANTITY_NAMES: Record<PreparedQuantity["key"], string> = {
  floor_sqft: "floor",
  ceiling_sqft: "ceiling",
  gross_wall_sqft: "walls (gross)",
  net_wall_sqft: "walls",
  perimeter_lf: "perimeter",
  baseboard_lf: "baseboard",
  count: "",
};

const UNIT_LABELS: Record<PreparedQuantity["unit"], string> = { sqft: "sq ft", lf: "LF", each: "" };

function fmt(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** "96 sq ft ceiling · measured", "3 · measured", "walls unknown · needs a height". */
export function quantityLabel(q: PreparedQuantity): string {
  const name = QUANTITY_NAMES[q.key];
  if (q.value === null) {
    return `${name || "amount"} unknown${q.key === "net_wall_sqft" || q.key === "gross_wall_sqft" ? " · needs a height" : ""}`;
  }
  const amount = [fmt(q.value), UNIT_LABELS[q.unit], name].filter(Boolean).join(" ");
  const basis = q.basis === "override" ? "your override" : q.basis;
  return `${amount} · ${basis}`;
}

export function hoursSourceLabel(source: HoursSource | null): string {
  switch (source) {
    case "price_book": return "price book";
    case "production_rate": return "production rate";
    case "ai_allowance": return "AI allowance";
    case "owner": return "yours";
    default: return "no hours yet";
  }
}

export function kindLabel(kind: ScopeTaskKind): string {
  return kind === "requested" ? "Requested" : kind === "observed" ? "Observed" : "AI suggestion";
}

/** "$4,025–$5,640" from the scope summary at a labor rate. */
export function tmRangeLabel(summary: PreparedScopeSummary, laborRateCents: number): string {
  const dollars = (c: number) => `$${Math.round(c / 100).toLocaleString("en-US")}`;
  return `${dollars(summary.hours_low * laborRateCents + summary.materials_cents)}–${dollars(summary.hours_high * laborRateCents + summary.materials_cents)}`;
}
