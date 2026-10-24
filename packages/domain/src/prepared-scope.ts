/**
 * Prepared scope — the structured draft Prepare Quote builds from a saved
 * assessment (TASK-179). Stored on `estimates.prepared_scope` so tasks,
 * quantities, hour ranges and questions reload intact.
 *
 * The model proposes tasks; this module binds them to measured quantities.
 * Quantities are calculated here from the room geometry, never by the model.
 * Unknown stays unknown: a missing measurement, hour range or materials price
 * is counted as missing, not as zero.
 */

import { z } from "zod";
import type { AssessmentRoom } from "./assessment-summary";
import { computeAssessmentRoomGeometry, type QuantityBasis } from "./painting";

/** Who raised the task. An AI suggestion needs the owner's confirmation. */
export type ScopeTaskKind = "observed" | "requested" | "suggested";

/** Where a starting hour range came from. */
export type HoursSource = "price_book" | "production_rate" | "ai_allowance" | "owner";

/** Which room quantity a task uses, or a plain count of items. */
export type QuantityKey =
  | "floor_sqft"
  | "ceiling_sqft"
  | "gross_wall_sqft"
  | "net_wall_sqft"
  | "perimeter_lf"
  | "baseboard_lf"
  | "count";

export interface PreparedQuantity {
  key: QuantityKey;
  value: number | null;
  unit: "sqft" | "lf" | "each";
  basis: QuantityBasis;
}

export interface PreparedTask {
  id: string;
  /** Assessment room id; null for whole-job work. */
  room_id: string | null;
  description: string;
  kind: ScopeTaskKind;
  /** Suggestions start unconfirmed and stay out of the totals until confirmed. */
  confirmed: boolean;
  /** The customer line this task rolls up into. */
  group_key: string;
  quantity_key: QuantityKey | null;
  /** The observed amount when quantity_key is "count" (3 faceplates, 2 ft of baseboard). */
  count: number | null;
  /** Unit of an observed amount; defaults to "each". */
  count_unit?: PreparedQuantity["unit"];
  /** Bound by `bindQuantities`; null when the task needs no quantity. */
  quantity: PreparedQuantity | null;
  hours_low: number | null;
  hours_high: number | null;
  hours_source: HoursSource | null;
  /** Materials allowance in cents; null means not priced yet. */
  materials_cents: number | null;
  price_book_code?: string | null;
}

export interface PreparedGroup {
  key: string;
  label: string;
}

export interface PreparedQuestion {
  id: string;
  /** The tasks this question affects; shown beside them. */
  task_ids: string[];
  text: string;
  answer: string | null;
}

export interface PreparedAlternative {
  id: string;
  label: string;
  task_ids: string[];
  note: string | null;
}

export interface PreparedScope {
  version: 1;
  source: {
    visit_id: string;
    assessment_id: string | null;
    /** The assessment revision this draft was prepared from. */
    assessment_updated_at: string | null;
  };
  groups: PreparedGroup[];
  tasks: PreparedTask[];
  questions: PreparedQuestion[];
  alternatives: PreparedAlternative[];
  exclusions: string[];
}

const UNITS: Record<QuantityKey, PreparedQuantity["unit"]> = {
  floor_sqft: "sqft",
  ceiling_sqft: "sqft",
  gross_wall_sqft: "sqft",
  net_wall_sqft: "sqft",
  perimeter_lf: "lf",
  baseboard_lf: "lf",
  count: "each",
};

function bindOne(task: PreparedTask, roomsById: Map<string, AssessmentRoom>): PreparedQuantity | null {
  const key = task.quantity_key;
  if (!key) return null;
  const unit = UNITS[key];
  if (key === "count") {
    const n = task.count;
    const countUnit = task.count_unit ?? unit;
    return typeof n === "number" && n > 0
      ? { key, value: n, unit: countUnit, basis: "measured" }
      : { key, value: null, unit: countUnit, basis: "unknown" };
  }
  const room = task.room_id ? roomsById.get(task.room_id) : undefined;
  if (!room) return { key, value: null, unit, basis: "unknown" };
  const q = computeAssessmentRoomGeometry(room)[key];
  return { key, value: q.value, unit, basis: q.basis };
}

/** Attach each task's quantity from the measured rooms. Pure; returns new tasks. */
export function bindQuantities(tasks: PreparedTask[], rooms: AssessmentRoom[]): PreparedTask[] {
  const roomsById = new Map(rooms.map((r) => [r.id, r]));
  return tasks.map((t) => ({ ...t, quantity: bindOne(t, roomsById) }));
}

export interface HoursCandidate {
  low: number | null;
  high: number | null;
}

/**
 * Choose a task's starting hour range: the price book first, then a production
 * rate applied to a measured quantity, then a labeled AI allowance. The owner
 * edits whatever is chosen; the source stays visible.
 */
export function pickStartingHours(candidates: {
  price_book?: HoursCandidate | null;
  production_rate?: HoursCandidate | null;
  ai_allowance?: HoursCandidate | null;
}): { low: number; high: number; source: HoursSource } | null {
  const order: Array<[Exclude<HoursSource, "owner">, HoursCandidate | null | undefined]> = [
    ["price_book", candidates.price_book],
    ["production_rate", candidates.production_rate],
    ["ai_allowance", candidates.ai_allowance],
  ];
  for (const [source, c] of order) {
    const low = c?.low ?? c?.high;
    const high = c?.high ?? c?.low;
    if (typeof low === "number" && typeof high === "number" && low >= 0 && high >= 0) {
      return { low: Math.min(low, high), high: Math.max(low, high), source };
    }
  }
  return null;
}

export interface PreparedGroupSummary {
  key: string;
  label: string;
  hours_low: number;
  hours_high: number;
  materials_cents: number;
}

export interface PreparedScopeSummary {
  groups: PreparedGroupSummary[];
  hours_low: number;
  hours_high: number;
  materials_cents: number;
  /** Confirmed tasks with no hour range yet. */
  tasks_without_hours: number;
  /** Confirmed tasks with no materials price yet (null, not zero). */
  tasks_without_materials_price: number;
  unconfirmed_suggestions: number;
}

/** Group and job totals over confirmed tasks. Missing values are counted, not zeroed. */
export function summarizePreparedScope(scope: PreparedScope): PreparedScopeSummary {
  const confirmed = scope.tasks.filter((t) => t.confirmed);
  const labels = new Map(scope.groups.map((g) => [g.key, g.label]));
  const order = [...scope.groups.map((g) => g.key), ...confirmed.map((t) => t.group_key)];
  const groups = new Map<string, PreparedGroupSummary>();
  for (const key of order) {
    if (!groups.has(key)) {
      groups.set(key, { key, label: labels.get(key) ?? key, hours_low: 0, hours_high: 0, materials_cents: 0 });
    }
  }
  for (const t of confirmed) {
    const g = groups.get(t.group_key)!;
    if (t.hours_low !== null && t.hours_high !== null) {
      g.hours_low += t.hours_low;
      g.hours_high += t.hours_high;
    }
    if (t.materials_cents !== null) g.materials_cents += t.materials_cents;
  }
  const list = [...groups.values()];
  return {
    groups: list,
    hours_low: list.reduce((s, g) => s + g.hours_low, 0),
    hours_high: list.reduce((s, g) => s + g.hours_high, 0),
    materials_cents: list.reduce((s, g) => s + g.materials_cents, 0),
    tasks_without_hours: confirmed.filter((t) => t.hours_low === null || t.hours_high === null).length,
    tasks_without_materials_price: confirmed.filter((t) => t.materials_cents === null).length,
    unconfirmed_suggestions: scope.tasks.filter((t) => t.kind === "suggested" && !t.confirmed).length,
  };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const hoursSchema = z.number().min(0).max(10_000).nullable();
const quantityUnit = z.enum(["sqft", "lf", "each"]);

/** Shape of `estimates.prepared_scope`. Validates on write and on readback. */
export const preparedScopeSchema = z.object({
  version: z.literal(1),
  source: z.object({
    visit_id: z.string(),
    assessment_id: z.string().nullable(),
    assessment_updated_at: z.string().nullable(),
  }),
  groups: z.array(z.object({ key: z.string().min(1).max(60), label: z.string().max(200) })).max(100),
  tasks: z
    .array(
      z.object({
        id: z.string().min(1).max(60),
        room_id: z.string().nullable(),
        description: z.string().min(1).max(500),
        kind: z.enum(["observed", "requested", "suggested"]),
        confirmed: z.boolean(),
        group_key: z.string().min(1).max(60),
        quantity_key: z
          .enum(["floor_sqft", "ceiling_sqft", "gross_wall_sqft", "net_wall_sqft", "perimeter_lf", "baseboard_lf", "count"])
          .nullable(),
        count: z.number().positive().nullable(),
        count_unit: quantityUnit.optional(),
        quantity: z
          .object({
            key: z.string(),
            value: z.number().nullable(),
            unit: quantityUnit,
            basis: z.enum(["measured", "assumed", "override", "unknown"]),
          })
          .nullable(),
        hours_low: hoursSchema,
        hours_high: hoursSchema,
        hours_source: z.enum(["price_book", "production_rate", "ai_allowance", "owner"]).nullable(),
        materials_cents: z.number().int().min(0).nullable(),
        price_book_code: z.string().max(40).nullable().optional(),
      }),
    )
    .max(200),
  questions: z
    .array(z.object({ id: z.string(), task_ids: z.array(z.string()), text: z.string().max(500), answer: z.string().max(1000).nullable() }))
    .max(100),
  alternatives: z
    .array(z.object({ id: z.string(), label: z.string().max(200), task_ids: z.array(z.string()), note: z.string().max(500).nullable() }))
    .max(50),
  exclusions: z.array(z.string().max(500)).max(50),
});

/** Read a stored prepared scope. Null when absent or not a valid version-1 scope. */
export function parsePreparedScope(raw: unknown): PreparedScope | null {
  const parsed = preparedScopeSchema.safeParse(raw);
  return parsed.success ? (parsed.data as PreparedScope) : null;
}
