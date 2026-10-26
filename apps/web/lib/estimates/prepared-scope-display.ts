import {
  allocateFixedPrice,
  materialListStale,
  summarizePreparedScope,
  type HoursSource,
  type PreparedQuantity,
  type PreparedScope,
  type PreparedScopeSummary,
  type ScopeTaskKind,
} from "@ai-fsm/domain";

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
    case "revision": return "revised from your note";
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

export interface WorkAreaRow {
  key: string;
  label: string;
  hours_low: number;
  hours_high: number;
  labor_cents: number;
  materials_cents: number;
  total_cents: number;
  /** Tasks in the area, and how many are in the price. */
  task_count: number;
  included_count: number;
  /** What still needs the owner: unanswered questions, included tasks missing hours or a materials price. */
  open_questions: number;
  missing_hours: number;
  missing_materials: number;
  /** Materials come from an itemized list (TASK-187), and whether its tasks changed since. */
  materials_itemized: boolean;
  materials_stale: boolean;
}

export interface WorkAreaTable {
  rows: WorkAreaRow[];
  labor_cents: number;
  materials_cents: number;
  total_cents: number;
}

/**
 * One row per work area for the collapsed review (TASK-185). T&M labor is the
 * group's midpoint hours (to the quarter hour) at the rate, the same as the
 * quote line; a fixed price uses its allocation, so rows add up to the price.
 * Pure.
 */
export function workAreaRows(scope: PreparedScope, laborRateCents: number): WorkAreaTable {
  const summary = summarizePreparedScope(scope);
  const pricing = scope.pricing;
  let fixedLabor: Map<string, number> | null = null;
  if (pricing?.mode === "fixed" && pricing.fixed_price_cents && pricing.fixed_price_cents >= summary.materials_cents) {
    fixedLabor = new Map();
    for (const line of allocateFixedPrice(scope, laborRateCents, pricing.fixed_price_cents)) {
      if (line.kind === "labor") fixedLabor.set(line.group_key, line.cents);
    }
  }
  const rows = summary.groups
    .map((g): WorkAreaRow => {
      const tasks = scope.tasks.filter((t) => t.group_key === g.key);
      const included = tasks.filter((t) => t.confirmed);
      const ids = new Set(tasks.map((t) => t.id));
      const mid = Math.round(((g.hours_low + g.hours_high) / 2) * 4) / 4;
      const list = scope.materials?.[g.key];
      const labor = fixedLabor ? fixedLabor.get(g.key) ?? 0 : Math.round(mid * laborRateCents);
      return {
        key: g.key,
        label: g.label,
        hours_low: g.hours_low,
        hours_high: g.hours_high,
        labor_cents: labor,
        materials_cents: g.materials_cents,
        total_cents: labor + g.materials_cents,
        task_count: tasks.length,
        included_count: included.length,
        open_questions: scope.questions.filter((q) => !q.answer && q.task_ids.some((id) => ids.has(id))).length,
        missing_hours: included.filter((t) => t.hours_low === null || t.hours_high === null).length,
        missing_materials: list
          ? list.lines.filter((l) => l.unit_cost_cents === null).length
          : included.filter((t) => t.materials_cents === null).length,
        materials_itemized: !!list,
        materials_stale: materialListStale(scope, g.key),
      };
    })
    .filter((r) => r.task_count > 0);
  const sum = (k: "labor_cents" | "materials_cents" | "total_cents") => rows.reduce((s, r) => s + r[k], 0);
  return { rows, labor_cents: sum("labor_cents"), materials_cents: sum("materials_cents"), total_cents: sum("total_cents") };
}

/** "2 open questions · 1 without hours", or "" when nothing needs the owner. */
export function workAreaFlags(row: WorkAreaRow): string {
  return [
    row.open_questions > 0 ? `${row.open_questions} open question${row.open_questions === 1 ? "" : "s"}` : null,
    row.missing_hours > 0 ? `${row.missing_hours} without hours` : null,
    row.missing_materials > 0 ? `${row.missing_materials} not priced` : null,
    row.materials_stale ? "materials list made before the tasks changed" : null,
  ].filter(Boolean).join(" · ");
}
