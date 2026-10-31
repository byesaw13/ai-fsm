import {
  PAINT_CENTS_PER_GALLON,
  pickStartingHours,
  trimPaintGallons,
  trimPaintHours,
  wallPaintGallons,
  wallPaintHours,
  wallHeightTimeFactor,
  type AssessmentRoomGeometry,
  type EstimateNote,
  type HoursCandidate,
  type HoursSource,
  type PaintGrade,
  type PreparedTask,
  type QuantityKey,
  type TaskMethod,
  type TrimPaintRate,
  type WallPaintRate,
} from "@ai-fsm/domain";

/**
 * Trade-aware estimating methods for prepared tasks (TASK-217).
 *
 * Classification (what the work is) comes from the model and is checked here;
 * the estimating method (how hours and materials are reached) is picked from
 * the data that exists: a production rate, then a documented price-book entry,
 * then the model's allowance. Every fallback and limitation is written as a
 * note on the task. Selling price is never an input: hours and materials are
 * worked out first and priced later at the account's rate. Pure.
 */

/** Price-book entries that price a whole room; never used for one task in it. */
export const ROOM_BUNDLE_CODES = new Set(["5020", "5022", "5023", "5024", "5025", "2014"]);
/** Price book "Room painting – ceiling add-on": the documented ceiling method while no ceiling rate exists. */
export const CEILING_PRICE_BOOK_CODE = "5021";
/** Price book "Trim/baseboard painting", per room; used only when rate 5003 is missing. */
export const TRIM_PRICE_BOOK_CODE = "5003";
/** Touch-up painting entries; covered when the room's walls are repainted. */
export const TOUCH_UP_CODES = new Set(["5008", "5009"]);

export type RepairClass = "ordinary_fill" | "patch_small" | "patch_medium" | "patch_large" | "texture_match";

/** Drywall patch price-book entry for each repair size. Ordinary filling outside a painted room is a small patch. */
export const PATCH_CODES: Record<RepairClass, string> = {
  ordinary_fill: "1001",
  patch_small: "1001",
  patch_medium: "1002",
  patch_large: "1003",
  texture_match: "1004",
};

export interface PriceBookEntry {
  code: string;
  name: string;
  labor_hours_low: number | null;
  labor_hours_typical: number | null;
  labor_hours_high: number | null;
}

/** The model's task fields the methods read. */
export interface MethodInput {
  method: TaskMethod;
  quantity_key: QuantityKey | null;
  count: number | null;
  count_unit: "each" | "lf" | "sqft" | null;
  hours_low: number | null;
  hours_high: number | null;
  materials_cents: number | null;
  customer_supplied: boolean;
  paint_grade: PaintGrade | null;
  price_book_code: string | null;
  repair_class: RepairClass | null;
  extra_visit: boolean;
}

export interface MethodContext {
  geometry: AssessmentRoomGeometry | null;
  byCode: Map<string, PriceBookEntry>;
  wallPaintRate?: WallPaintRate | null;
  trimPaintRate?: TrimPaintRate | null;
}

export interface MethodEstimate {
  quantity_key: QuantityKey | null;
  hours: { low: number; high: number; source: HoursSource } | null;
  materials_cents: number | null;
  price_book_code: string | null;
  notes: EstimateNote[];
}

function nonNegative(n: number | null): number | null {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
}

function bookHours(pb: PriceBookEntry | undefined): HoursCandidate | null {
  if (!pb) return null;
  const low = pb.labor_hours_low ?? pb.labor_hours_typical;
  const high = pb.labor_hours_high ?? pb.labor_hours_typical;
  return low === null && high === null ? null : { low, high };
}

function fmt(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

function paint(gallons: number, grade: PaintGrade | null, notes: EstimateNote[]): number {
  const g = grade ?? "standard";
  const each = PAINT_CENTS_PER_GALLON[g];
  notes.push({ kind: "assumption", text: `${gallons} gal at the ${g} default price ($${each / 100}/gal), not a saved price.` });
  return gallons * each;
}

const UNCALIBRATED = "has not been checked against your jobs. Review these hours.";

/** Estimate one classified task. Pure. */
export function estimateTask(t: MethodInput, ctx: MethodContext): MethodEstimate {
  const notes: EstimateNote[] = [];
  const ai = { low: nonNegative(t.hours_low), high: nonNegative(t.hours_high) };
  let pb = t.price_book_code ? ctx.byCode.get(t.price_book_code) : undefined;
  if (pb && ROOM_BUNDLE_CODES.has(pb.code) && t.method !== "generic") {
    notes.push({ kind: "assumption", text: `Whole-room price book entry ${pb.code} was not used for a single task.` });
    pb = undefined;
  }
  const g = ctx.geometry;
  const supplied = t.customer_supplied;

  switch (t.method) {
    case "wall_paint": {
      const key: QuantityKey | null =
        g && g.net_wall_sqft.value !== null
          ? "net_wall_sqft"
          : t.quantity_key === "gross_wall_sqft" || t.quantity_key === "net_wall_sqft"
            ? t.quantity_key
            : "net_wall_sqft";
      const sqft = g && (key === "net_wall_sqft" || key === "gross_wall_sqft") ? g[key].value : null;
      const paced = wallPaintHours(sqft, g?.max_wall_height_ft ?? null, ctx.wallPaintRate ?? null);
      if (paced) {
        notes.push({
          kind: "limitation",
          text: `Rate 5012 (${ctx.wallPaintRate!.sqft_per_day} sq ft a day) ${UNCALIBRATED} It includes standard prep: filling ordinary nail holes and light sanding.`,
        });
        const height = wallHeightTimeFactor(g?.max_wall_height_ft ?? null);
        if (height.factor > 1) {
          notes.push({
            kind: "assumption",
            text: `Walls up to ${g!.max_wall_height_ft} ft: ${height.factor}× the hours (Craftsman height factor, ${height.band}).${height.aboveTable ? " Above 21 ft: price the staging separately." : ""}`,
          });
        }
      } else if (sqft === null) {
        notes.push({ kind: "missing", text: "Wall area unknown: add the room's height and count its doors and windows." });
      } else {
        notes.push({ kind: "missing", text: "No wall painting rate (5012)." });
      }
      const hours = pickStartingHours({ production_rate: paced, price_book: bookHours(pb), ai_allowance: ai });
      let materials: number | null = supplied ? 0 : null;
      if (!supplied && sqft !== null) materials = paint(wallPaintGallons(sqft), t.paint_grade, notes);
      else if (!supplied) notes.push({ kind: "missing", text: "Paint not priced until the wall area is known." });
      return { quantity_key: key, hours, materials_cents: materials, price_book_code: pb?.code ?? null, notes };
    }

    case "ceiling_paint": {
      const sqft = g?.ceiling_sqft.value ?? null;
      const book = ctx.byCode.get(CEILING_PRICE_BOOK_CODE);
      const bookRange = bookHours(book);
      if (bookRange) {
        notes.push({
          kind: "limitation",
          text: `No ceiling production rate. Hours are price book ${CEILING_PRICE_BOOK_CODE}, a per-room allowance that does not scale with ${sqft === null ? "the ceiling area" : `the ${fmt(sqft)} sq ft measured`}.`,
        });
      } else {
        notes.push({ kind: "missing", text: "No ceiling production rate or price book entry; hours are the AI allowance." });
      }
      if (sqft === null) notes.push({ kind: "missing", text: "Ceiling area unknown: add the room's length and width." });
      const hours = pickStartingHours({ price_book: bookRange, ai_allowance: ai });
      let materials: number | null = supplied ? 0 : null;
      if (!supplied && sqft !== null) materials = paint(wallPaintGallons(sqft), t.paint_grade, notes);
      else if (!supplied) notes.push({ kind: "missing", text: "Ceiling paint not priced until the ceiling area is known." });
      return {
        quantity_key: "ceiling_sqft",
        hours,
        materials_cents: materials,
        price_book_code: bookRange ? CEILING_PRICE_BOOK_CODE : null,
        notes,
      };
    }

    case "trim_paint": {
      const counted = t.quantity_key === "count" && t.count_unit === "lf" && (t.count ?? 0) > 0;
      const key: QuantityKey = counted ? "count" : "baseboard_lf";
      const lf = counted ? t.count : (g?.baseboard_lf.value ?? null);
      const paced = trimPaintHours(lf, ctx.trimPaintRate ?? null);
      const book = ctx.byCode.get(TRIM_PRICE_BOOK_CODE);
      if (paced) {
        notes.push({ kind: "limitation", text: `Rate 5003 (${ctx.trimPaintRate!.linear_ft_per_day} linear ft a day) ${UNCALIBRATED}` });
      } else if (lf === null) {
        notes.push({ kind: "missing", text: "Trim length unknown: add the room's size and count its doors, or enter the length." });
      } else {
        notes.push({ kind: "missing", text: "No trim painting rate (5003)." });
      }
      const fromBook = !paced && bookHours(book) !== null;
      if (fromBook) {
        notes.push({ kind: "limitation", text: `Hours are price book ${TRIM_PRICE_BOOK_CODE}, a per-room allowance that does not scale with length.` });
      }
      const hours = pickStartingHours({ production_rate: paced, price_book: fromBook ? bookHours(book) : null, ai_allowance: ai });
      let materials: number | null = supplied ? 0 : null;
      if (!supplied && lf !== null) {
        materials = paint(trimPaintGallons(lf), t.paint_grade, notes);
        notes.push({ kind: "assumption", text: `Trim paint from ${fmt(lf)} linear ft at 0.5 sq ft per foot, rounded up to whole gallons.` });
      } else if (!supplied) {
        notes.push({ kind: "missing", text: "Trim paint not priced until the length is known." });
      }
      return { quantity_key: key, hours, materials_cents: materials, price_book_code: fromBook ? TRIM_PRICE_BOOK_CODE : null, notes };
    }

    case "drywall_prep": {
      const cls = t.repair_class ?? "patch_small";
      if (!t.repair_class) notes.push({ kind: "assumption", text: "Repair size not given; priced as a small patch (6 in or less)." });
      const code = PATCH_CODES[cls];
      const book = ctx.byCode.get(code);
      const range = bookHours(book);
      const n = t.count ?? null;
      if (range) {
        notes.push({
          kind: "assumption",
          text: `Price book ${code} (${book!.name}), counted once for ${n && n > 1 ? `these ${fmt(n)} repairs` : "this repair"}, not per hole.`,
        });
      } else {
        notes.push({ kind: "missing", text: `No price book entry ${code}; hours are the AI allowance.` });
      }
      if (t.extra_visit) {
        notes.push({ kind: "assumption", text: "Needs a return visit (compound drying between coats). That visit's setup belongs with this task." });
      }
      const hours = pickStartingHours({ price_book: range, ai_allowance: ai });
      if (!supplied) notes.push({ kind: "missing", text: "Patching materials have no saved price. Itemize materials or enter a price." });
      return { quantity_key: "count", hours, materials_cents: supplied ? 0 : null, price_book_code: range ? code : null, notes };
    }

    default: {
      const hours = pickStartingHours({ price_book: bookHours(pb), ai_allowance: ai });
      if (hours?.source === "ai_allowance") {
        notes.push({ kind: "assumption", text: "No trade method fits this work; hours are the AI allowance." });
      }
      return {
        quantity_key: t.quantity_key,
        hours,
        materials_cents: supplied ? 0 : nonNegative(t.materials_cents),
        price_book_code: pb?.code ?? null,
        notes,
      };
    }
  }
}

/** Per-task facts the room rules need that are not stored on the task. */
export interface RoomRuleFacts {
  repair_class: RepairClass | null;
  extra_visit: boolean;
  ai_hours: HoursCandidate;
}

/**
 * Rules that look across a room's tasks, applied to the given tasks only (new
 * ones), so owner choices on existing tasks are never undone:
 * - ordinary nail-hole filling in a room whose walls are painted is part of
 *   wall-painting prep (rate 5012): no extra hours or materials, unless it
 *   needs a return visit;
 * - touch-up painting in a room whose walls are repainted starts left out;
 * - a whole-room price-book entry on a task in a room that has trade tasks is
 *   replaced by the model's allowance. Pure.
 */
export function applyRoomRules(tasks: PreparedTask[], facts: Map<string, RoomRuleFacts>): PreparedTask[] {
  const paintedRooms = new Set(
    tasks.filter((t) => t.confirmed && t.method === "wall_paint" && t.room_id).map((t) => t.room_id!),
  );
  const tradeRooms = new Set(
    tasks
      .filter((t) => t.room_id && (t.method === "wall_paint" || t.method === "ceiling_paint" || t.method === "trim_paint"))
      .map((t) => t.room_id!),
  );
  return tasks.map((t) => {
    const f = facts.get(t.id);
    if (!f || !t.room_id) return t;
    const notes = [...(t.estimate_notes ?? [])];
    if (t.method === "drywall_prep" && f.repair_class === "ordinary_fill" && !f.extra_visit && paintedRooms.has(t.room_id)) {
      return {
        ...t,
        hours_low: 0,
        hours_high: 0,
        hours_source: "production_rate",
        materials_cents: 0,
        price_book_code: null,
        estimate_notes: [
          { kind: "assumption", text: "Ordinary nail-hole filling is part of standard wall-painting prep (rate 5012), so no extra hours. If the walls are not painted, price it as patch 1001." },
        ],
      };
    }
    if (t.price_book_code && TOUCH_UP_CODES.has(t.price_book_code) && paintedRooms.has(t.room_id)) {
      notes.push({ kind: "assumption", text: "The walls in this room are being repainted, so touch-up is covered. Left out; tick it to include." });
      return { ...t, confirmed: false, estimate_notes: notes.slice(0, 10) };
    }
    if (t.method === "generic" && t.price_book_code && ROOM_BUNDLE_CODES.has(t.price_book_code) && tradeRooms.has(t.room_id)) {
      const hours = pickStartingHours({ ai_allowance: f.ai_hours });
      notes.push({ kind: "assumption", text: `Whole-room price book entry ${t.price_book_code} was not used: this room's surfaces are estimated separately.` });
      return {
        ...t,
        price_book_code: null,
        hours_low: hours?.low ?? null,
        hours_high: hours?.high ?? null,
        hours_source: hours?.source ?? null,
        estimate_notes: notes.slice(0, 10),
      };
    }
    return t;
  });
}
