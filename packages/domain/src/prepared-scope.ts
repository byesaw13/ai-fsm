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
export type HoursSource = "price_book" | "production_rate" | "ai_allowance" | "owner" | "revision";

/**
 * What kind of work a task is (TASK-217). Classification only: the estimating
 * method that sets its hours and materials is chosen from what data exists, so
 * a task can be ceiling painting even when no ceiling production rate exists.
 */
export type TaskMethod = "wall_paint" | "ceiling_paint" | "trim_paint" | "drywall_prep" | "generic";

/** Something the owner should know about how a task was estimated. */
export interface EstimateNote {
  /** missing: a measurement, rate or price is absent. limitation: the method used has a known weakness. assumption: a judgment the app made. */
  kind: "missing" | "limitation" | "assumption";
  text: string;
}

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
  /** Kind of work (TASK-217); absent on tasks prepared before it. */
  method?: TaskMethod;
  /** How the hours and materials were reached and what is missing. */
  estimate_notes?: EstimateNote[];
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
  /** Owner-set add-on price shown to the customer; null or absent = no price yet (TASK-224). */
  price_cents?: number | null;
}

/** How the owner prices the prepared quote, and the inputs for modeling profit (TASK-180). */
export interface PreparedPricing {
  mode: "tm" | "fixed";
  fixed_price_cents: number | null;
  /** Hours used for profit; null means the midpoint of the range. */
  expected_hours: number | null;
  /** Overhead and job expenses allocated to this quote. */
  overhead_cents: number;
  /** Risk reserve, percent of modeled cost. */
  reserve_pct: number;
}

export const DEFAULT_PREPARED_PRICING: PreparedPricing = {
  mode: "tm",
  fixed_price_cents: null,
  expected_hours: null,
  overhead_cents: 0,
  reserve_pct: 0,
};

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
  pricing?: PreparedPricing;
  /** The customer notes Apply last wrote; Apply only replaces notes that are blank or still this text. */
  proposal_notes?: string | null;
  /** Revisions the owner kept, newest last (TASK-186). */
  revisions?: PreparedRevision[];
  /** Itemized materials by group key (TASK-187). A listed group's materials come from its lines, not task allowances. */
  materials?: Record<string, PreparedMaterialList>;
  /** Owner: one color everywhere, so paint shared by rooms is bought together (TASK-227). */
  pool_paint?: boolean;
}

/** Where a material line's price came from. */
export type MaterialPriceSource = "your_price" | "ai_estimate" | "owner";

export interface PreparedMaterialLine {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  /** Cost per unit in cents; null means not priced. */
  unit_cost_cents: number | null;
  source: MaterialPriceSource;
  /** The saved material it was priced from, if any. */
  price_book_id: string | null;
  notes: string;
}

export interface PreparedMaterialList {
  /** The included tasks the list was made for; a different set means it may be out of date. */
  task_ids: string[];
  lines: PreparedMaterialLine[];
  /** Items the customer supplies, left off the list. */
  customer_supplied: string[];
  assumptions: string[];
}

/** Cost of one material line, or null when it has no price. */
export function materialLineCents(line: PreparedMaterialLine): number | null {
  return line.unit_cost_cents === null ? null : Math.round(line.unit_cost_cents * line.quantity);
}

/** One product bought for several rooms in whole containers (TASK-227). */
export interface PooledPaint {
  name: string;
  /** Per gallon. A pail is priced as 5 gallons and a quart as a quarter; the owner edits the line price. */
  unit_cost_cents: number;
  /** Gallons the rooms need together. */
  needed: number;
  pails: number;
  gallons: number;
  quarts: number;
  cost_cents: number;
  /** Each room's share of cost_cents, by its need; adds up exactly. */
  shares: Record<string, number>;
  /** The itemized lines this replaces, as `${groupKey}/${lineId}`. */
  line_refs: string[];
}

const PAIL_GALLONS = 5;

function isGallons(unit: string): boolean {
  return /^gal(lon)?s?$/i.test(unit.trim());
}

/**
 * Paint shared by rooms, bought together: a priced gallon product listed in
 * two or more rooms becomes 5-gal pails, then whole gallons; quarts only when
 * the whole need is under a gallon. Off unless the owner turns it on.
 */
export function pooledPaint(scope: PreparedScope): PooledPaint[] {
  if (!scope.pool_paint || !scope.materials) return [];
  const byName = new Map<string, { name: string; cost: number; need: Map<string, number>; refs: string[] }>();
  for (const [key, list] of Object.entries(scope.materials)) {
    for (const line of list.lines) {
      if (!isGallons(line.unit) || !line.unit_cost_cents || line.quantity <= 0) continue;
      const id = `${line.name.trim().toLowerCase()}|${line.unit_cost_cents}`;
      const entry = byName.get(id) ?? { name: line.name, cost: line.unit_cost_cents, need: new Map<string, number>(), refs: [] as string[] };
      entry.need.set(key, (entry.need.get(key) ?? 0) + line.quantity);
      entry.refs.push(`${key}/${line.id}`);
      byName.set(id, entry);
    }
  }
  const out: PooledPaint[] = [];
  for (const e of byName.values()) {
    if (e.need.size < 2) continue;
    const needed = Math.round([...e.need.values()].reduce((a, b) => a + b, 0) * 100) / 100;
    let pails = Math.floor(needed / PAIL_GALLONS);
    let gallons = Math.ceil(needed - pails * PAIL_GALLONS - 1e-9);
    let quarts = 0;
    if (pails === 0 && needed < 1) {
      quarts = Math.ceil(needed * 4 - 1e-9);
      gallons = 0;
    }
    if (gallons === PAIL_GALLONS) {
      pails += 1;
      gallons = 0;
    }
    const cost_cents = Math.round(e.cost * (pails * PAIL_GALLONS + gallons + quarts / 4));
    out.push({
      name: e.name,
      unit_cost_cents: e.cost,
      needed,
      pails,
      gallons,
      quarts,
      cost_cents,
      shares: splitByWeight(cost_cents, e.need),
      line_refs: e.refs,
    });
  }
  return out;
}

/** Split whole cents by weight, largest remainder first, so the parts add up exactly. */
function splitByWeight(total: number, weights: Map<string, number>): Record<string, number> {
  const sum = [...weights.values()].reduce((a, b) => a + b, 0);
  const raw = [...weights.entries()].map(([k, w]) => [k, (total * w) / sum] as const);
  const shares: Record<string, number> = Object.fromEntries(raw.map(([k, v]) => [k, Math.floor(v)]));
  let left = total - Object.values(shares).reduce((a, b) => a + b, 0);
  for (const [k] of [...raw].sort((a, b) => (b[1] % 1) - (a[1] % 1))) {
    if (left <= 0) break;
    shares[k] += 1;
    left -= 1;
  }
  return shares;
}

/** The group's included tasks no longer match the ones its list was made for. */
export function materialListStale(scope: PreparedScope, groupKey: string): boolean {
  const list = scope.materials?.[groupKey];
  if (!list) return false;
  const now = scope.tasks.filter((t) => t.group_key === groupKey && t.confirmed).map((t) => t.id).sort();
  const then = [...list.task_ids].sort();
  return now.length !== then.length || now.some((id, i) => id !== then[i]);
}

export interface PreparedRevision {
  at: string;
  instruction: string;
  summary: string;
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
  const order: Array<[Exclude<HoursSource, "owner" | "revision">, HoursCandidate | null | undefined]> = [
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

/** Walls above this height are tall work: ladders or planks, slower going. */
export const TALL_WALL_FT = 10;

/** The owner's wall painting pace (production rate 5012 and its vaulted modifier). */
export interface WallPaintRate {
  /** Wall square feet per 8-hour day, two finish coats, standard prep. */
  sqft_per_day: number;
  /** Production change for tall walls, e.g. -0.15 = 15% slower. */
  tall_wall_modifier_pct: number;
}

/**
 * Hour range for painting a wall area at the owner's pace (TASK-184): the
 * area over the daily rate, slowed for tall walls, plus or minus 15%, in
 * quarter hours. Null when the area or the rate is missing.
 */
export function wallPaintHours(
  sqft: number | null,
  maxWallHeightFt: number | null,
  rate: WallPaintRate | null,
): HoursCandidate | null {
  if (!rate || rate.sqft_per_day <= 0 || sqft === null || sqft <= 0) return null;
  const tall = maxWallHeightFt !== null && maxWallHeightFt > TALL_WALL_FT;
  const perDay = rate.sqft_per_day * (1 + (tall ? rate.tall_wall_modifier_pct : 0));
  if (perDay <= 0) return null;
  const hours = (sqft / perDay) * 8;
  const quarter = (n: number) => Math.max(0.25, Math.round(n * 4) / 4);
  return { low: quarter(hours * 0.85), high: quarter(hours * 1.15) };
}

/** The owner's trim painting pace (production rate 5003, baseboard and casing). */
export interface TrimPaintRate {
  linear_ft_per_day: number;
}

/** Hour range for trim at the owner's pace: length over the daily rate, plus or minus 15%, in quarter hours (TASK-217). */
export function trimPaintHours(linearFt: number | null, rate: TrimPaintRate | null): HoursCandidate | null {
  if (!rate || rate.linear_ft_per_day <= 0 || linearFt === null || linearFt <= 0) return null;
  const hours = (linearFt / rate.linear_ft_per_day) * 8;
  const quarter = (n: number) => Math.max(0.25, Math.round(n * 4) / 4);
  return { low: quarter(hours * 0.85), high: quarter(hours * 1.15) };
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
  /** Confirmed tasks with no materials price yet (null, not zero), outside itemized groups. */
  tasks_without_materials_price: number;
  /** Itemized material lines with no price yet (TASK-187). */
  material_lines_without_price?: number;
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
  const itemized = scope.materials ?? {};
  for (const t of confirmed) {
    const g = groups.get(t.group_key)!;
    if (t.hours_low !== null && t.hours_high !== null) {
      g.hours_low += t.hours_low;
      g.hours_high += t.hours_high;
    }
    if (t.materials_cents !== null && !itemized[t.group_key]) g.materials_cents += t.materials_cents;
  }
  let unpricedLines = 0;
  // Paint bought together (TASK-227): each room carries its share of the real purchase.
  const pooled = pooledPaint(scope);
  const pooledRefs = new Set(pooled.flatMap((p) => p.line_refs));
  for (const p of pooled) {
    for (const [key, cents] of Object.entries(p.shares)) {
      const g = groups.get(key);
      if (g) g.materials_cents += cents;
    }
  }
  for (const [key, list] of Object.entries(itemized)) {
    const g = groups.get(key);
    if (!g) continue;
    for (const line of list.lines) {
      if (pooledRefs.has(`${key}/${line.id}`)) continue;
      const cents = materialLineCents(line);
      if (cents === null) unpricedLines += 1;
      else g.materials_cents += cents;
    }
  }
  const list = [...groups.values()];
  return {
    groups: list,
    hours_low: list.reduce((s, g) => s + g.hours_low, 0),
    hours_high: list.reduce((s, g) => s + g.hours_high, 0),
    materials_cents: list.reduce((s, g) => s + g.materials_cents, 0),
    tasks_without_hours: confirmed.filter((t) => t.hours_low === null || t.hours_high === null).length,
    tasks_without_materials_price: confirmed.filter((t) => t.materials_cents === null && !itemized[t.group_key]).length,
    material_lines_without_price: unpricedLines,
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
        hours_source: z.enum(["price_book", "production_rate", "ai_allowance", "owner", "revision"]).nullable(),
        materials_cents: z.number().int().min(0).nullable(),
        price_book_code: z.string().max(40).nullable().optional(),
        method: z.enum(["wall_paint", "ceiling_paint", "trim_paint", "drywall_prep", "generic"]).optional(),
        estimate_notes: z
          .array(z.object({ kind: z.enum(["missing", "limitation", "assumption"]), text: z.string().max(300) }))
          .max(10)
          .optional(),
      }),
    )
    .max(200),
  questions: z
    .array(z.object({ id: z.string(), task_ids: z.array(z.string()), text: z.string().max(500), answer: z.string().max(1000).nullable() }))
    .max(100),
  alternatives: z
    .array(z.object({
        id: z.string(),
        label: z.string().max(200),
        task_ids: z.array(z.string()),
        note: z.string().max(500).nullable(),
        price_cents: z.number().int().min(0).max(100_000_000).nullable().optional(),
      }))
    .max(50),
  exclusions: z.array(z.string().max(500)).max(50),
  pricing: z
    .object({
      mode: z.enum(["tm", "fixed"]),
      fixed_price_cents: z.number().int().min(0).max(100_000_000).nullable(),
      expected_hours: z.number().min(0).max(10_000).nullable(),
      overhead_cents: z.number().int().min(0).max(100_000_000),
      reserve_pct: z.number().min(0).max(100),
    })
    .optional(),
  proposal_notes: z.string().max(20_000).nullable().optional(),
  revisions: z
    .array(z.object({ at: z.string(), instruction: z.string().max(2000), summary: z.string().max(2000) }))
    .max(50)
    .optional(),
  materials: z
    .record(
      z.string().max(60),
      z.object({
        task_ids: z.array(z.string()).max(200),
        lines: z
          .array(
            z.object({
              id: z.string().min(1).max(60),
              name: z.string().min(1).max(200),
              quantity: z.number().min(0).max(100_000),
              unit: z.string().max(40),
              unit_cost_cents: z.number().int().min(0).max(10_000_000).nullable(),
              source: z.enum(["your_price", "ai_estimate", "owner"]),
              price_book_id: z.string().nullable(),
              notes: z.string().max(500),
            }),
          )
          .max(100),
        customer_supplied: z.array(z.string().max(200)).max(50),
        assumptions: z.array(z.string().max(500)).max(50),
      }),
    )
    .optional(),
  pool_paint: z.boolean().optional(),
});

/** Read a stored prepared scope. Null when absent or not a valid version-1 scope. */
export function parsePreparedScope(raw: unknown): PreparedScope | null {
  const parsed = preparedScopeSchema.safeParse(raw);
  return parsed.success ? (parsed.data as PreparedScope) : null;
}

// ---------------------------------------------------------------------------
// Pricing and modeled profit (TASK-180)
// ---------------------------------------------------------------------------

export interface PreparedProfitModel {
  mode: PreparedPricing["mode"];
  tm_low_cents: number;
  tm_high_cents: number;
  expected_hours: number;
  labor_cost_cents: number;
  materials_cents: number;
  overhead_cents: number;
  reserve_cents: number;
  /** Labor cost + materials + overhead (reserve shown separately). */
  modeled_cost_cents: number;
  /** Fixed price, or the T&M bill at the expected hours; null for a fixed quote with no price yet. */
  sell_cents: number | null;
  /** Sell price minus modeled cost and reserve. Not net profit. */
  remainder_cents: number | null;
  /** Remainder as a percent of the sell price, two decimals. */
  margin_pct: number | null;
}

/**
 * Model what a prepared quote leaves after allocated costs. Labor cost uses the
 * owner's cost rate, not the billing rate, so overhead or profit inside the
 * billing rate is not counted twice. Pure.
 */
export function modelPreparedProfit(
  scope: PreparedScope,
  rates: { laborRateCents: number; laborCostCents: number },
): PreparedProfitModel {
  const pricing = scope.pricing ?? DEFAULT_PREPARED_PRICING;
  const s = summarizePreparedScope(scope);
  const expected = pricing.expected_hours ?? (s.hours_low + s.hours_high) / 2;
  const labor = Math.round(expected * rates.laborCostCents);
  const modeled = labor + s.materials_cents + pricing.overhead_cents;
  const reserve = Math.round((modeled * pricing.reserve_pct) / 100);
  const sell =
    pricing.mode === "fixed"
      ? pricing.fixed_price_cents
      : Math.round(expected * rates.laborRateCents) + s.materials_cents;
  const remainder = sell === null ? null : sell - modeled - reserve;
  return {
    mode: pricing.mode,
    tm_low_cents: Math.round(s.hours_low * rates.laborRateCents) + s.materials_cents,
    tm_high_cents: Math.round(s.hours_high * rates.laborRateCents) + s.materials_cents,
    expected_hours: expected,
    labor_cost_cents: labor,
    materials_cents: s.materials_cents,
    overhead_cents: pricing.overhead_cents,
    reserve_cents: reserve,
    modeled_cost_cents: modeled,
    sell_cents: sell,
    remainder_cents: remainder,
    margin_pct: sell && remainder !== null ? Math.round((remainder / sell) * 10_000) / 100 : null,
  };
}

export interface FixedPriceLine {
  group_key: string;
  label: string;
  kind: "labor" | "materials";
  cents: number;
}

/**
 * Split a fixed price into per-group lines that sum to it exactly. Each group
 * keeps its materials allowance; the rest is shared by each group's midpoint
 * labor hours (largest-remainder rounding). Throws when the price is below the
 * materials total. Pure.
 */
export function allocateFixedPrice(scope: PreparedScope, laborRateCents: number, fixedCents: number): FixedPriceLine[] {
  const s = summarizePreparedScope(scope);
  const pool = fixedCents - s.materials_cents;
  if (pool < 0) throw new Error("The fixed price is below the materials total");
  const groups = s.groups.filter((g) => g.hours_high > 0 || g.materials_cents > 0);
  const weights = groups.map((g) => ((g.hours_low + g.hours_high) / 2) * laborRateCents);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const shares =
    totalWeight > 0
      ? weights.map((w) => (pool * w) / totalWeight)
      : groups.map((_, i) => (i === 0 ? pool : 0));
  const floors = shares.map(Math.floor);
  let left = pool - floors.reduce((a, b) => a + b, 0);
  const byFraction = shares.map((v, i) => [v - floors[i], i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of byFraction) {
    if (left <= 0) break;
    floors[i] += 1;
    left -= 1;
  }
  const lines: FixedPriceLine[] = [];
  groups.forEach((g, i) => {
    if (floors[i] > 0) lines.push({ group_key: g.key, label: g.label, kind: "labor", cents: floors[i] });
    if (g.materials_cents > 0) lines.push({ group_key: g.key, label: g.label, kind: "materials", cents: g.materials_cents });
  });
  return lines;
}
