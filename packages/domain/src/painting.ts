/**
 * Dovetails Services LLC — Room-by-room painting estimator.
 *
 * All money values are in CENTS.
 * Imported by the estimate builder and the PDF/print renderer.
 */

import type { AssessmentRoom } from "./assessment-summary";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RoomPrepLevel = "clean" | "minor" | "moderate" | "major";
export type PaintGrade = "economy" | "standard" | "premium" | "designer";
export type PaintSupplier = "dovetails" | "customer";

export interface RoomSpec {
  name: string;              // e.g. "Living Room"
  length_ft: number;
  width_ft: number;
  ceiling_height_ft: number;
  doors: number;             // each deducts 20 sqft from wall area
  windows: number;           // each deducts 15 sqft from wall area
  include_ceiling: boolean;
  include_trim: boolean;     // baseboard/crown molding; LF computed from perimeter
  prep_level: RoomPrepLevel;
  paint_supplied_by: PaintSupplier;
  paint_grade: PaintGrade;   // ignored when paint_supplied_by = "customer"
  primer_needed: boolean;
  dark_to_light: boolean;    // extra primer pass — increases material qty
}

export interface ProjectOptions {
  coat_count: number;        // default 2
  occupied_home: boolean;    // affects schedule notes only, not price in this phase
  vaulted_ceilings: boolean; // flag for schedule notes; vaulted rooms add manually
}

export interface RoomMeasurements {
  wall_sqft: number;
  ceiling_sqft: number;
  trim_lf: number;
  gross_wall_sqft: number;   // before door/window deductions (for material waste calc)
}

/**
 * Paint and primer to buy for a set of rooms (TASK-229). The one place room
 * paint quantities come from: the quote's material lines, the preview and the
 * shopping list all read it. Customer-supplied rooms add no paint.
 */
export interface PaintingMaterials {
  total_wall_sqft: number;
  total_ceiling_sqft: number;
  total_trim_lf: number;
  total_paint_gallons: number;
  total_primer_gallons: number;
  material_cents: number;
  items: Array<{
    item: string;
    qty: number;
    unit: string;
    cost_cents: number;
  }>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DOOR_DEDUCTION_SQFT = 20;      // per door
const WINDOW_DEDUCTION_SQFT = 15;    // per window
const DOOR_TRIM_DEDUCTION_LF = 3;    // per door opening (no baseboard across threshold)
const COVERAGE_SQFT_PER_GAL = 350;   // finish coat coverage
const PRIMER_COVERAGE_SQFT_PER_GAL = 250;
const WASTE_FACTOR = 1.10;

export const PAINT_CENTS_PER_GALLON: Record<PaintGrade, number> = {
  economy:  35_00,   // $35/gal
  standard: 55_00,   // $55/gal (Sherwin-Williams ProMar 200)
  premium:  75_00,   // $75/gal
  designer: 95_00,   // $95/gal
};

const PRIMER_CENTS_PER_GALLON = 48_00; // ProMar 200 Primer

// ---------------------------------------------------------------------------
// Per-room computation
// ---------------------------------------------------------------------------

export function computeRoomMeasurements(room: RoomSpec): RoomMeasurements {
  const { length_ft, width_ft, ceiling_height_ft, doors, windows, include_trim } = room;

  const perimeter = 2 * (length_ft + width_ft);
  const gross_wall_sqft = perimeter * ceiling_height_ft;
  const deductions = doors * DOOR_DEDUCTION_SQFT + windows * WINDOW_DEDUCTION_SQFT;
  const wall_sqft = Math.max(0, gross_wall_sqft - deductions);
  const ceiling_sqft = room.include_ceiling ? length_ft * width_ft : 0;
  const trim_lf = include_trim
    ? Math.max(0, perimeter - doors * DOOR_TRIM_DEDUCTION_LF)
    : 0;

  return { wall_sqft, ceiling_sqft, trim_lf, gross_wall_sqft };
}

// ---------------------------------------------------------------------------
// Assessment room geometry (TASK-178)
// ---------------------------------------------------------------------------

/** Assumed height of a non-standard opening measured only by width (6 ft 8 in). */
const OPENING_HEIGHT_IN = 80;

/** Where a quantity came from. Unknown is never shown as a number. */
export type QuantityBasis = "measured" | "assumed" | "override" | "unknown";

export interface RoomQuantity {
  value: number | null;
  basis: QuantityBasis;
}

export interface AssessmentRoomGeometry {
  floor_sqft: RoomQuantity;
  ceiling_sqft: RoomQuantity;
  perimeter_lf: RoomQuantity;
  gross_wall_sqft: RoomQuantity;
  opening_deduction_sqft: RoomQuantity;
  net_wall_sqft: RoomQuantity;
  baseboard_lf: RoomQuantity;
  /** Doors and windows were both counted, so deductions can be calculated. */
  openings_known: boolean;
  /** Tallest painted wall point: the peak when vaulted, else the wall height. */
  max_wall_height_ft: number | null;
  /** Gross area comes from the listed walls only, not the whole perimeter. */
  partial_walls: boolean;
  /** Built-ins and other unpainted areas included in the deduction. */
  skip_area_sqft: number;
}

const UNKNOWN: RoomQuantity = { value: null, basis: "unknown" };

function measured(value: number | null): RoomQuantity {
  return value === null ? UNKNOWN : { value, basis: "measured" };
}

function positive(n: number | null | undefined): number | null {
  return typeof n === "number" && n > 0 ? n : null;
}

/** A half-typed form value (negative, fractional, NaN) counts as not counted. */
function count(n: number | undefined): number | undefined {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 ? n : undefined;
}

/**
 * Quantities for one assessment room, with the source of each. Standard doors
 * and windows use the same deductions as the painting estimator; a measured
 * opening deducts its width at standard door height. Missing measurements
 * leave a quantity unknown rather than zero or a default. Does not replace
 * `computeRoomMeasurements`, which the painting editor and saved quotes use.
 *
 * TASK-184: listed walls replace the perimeter (each at the wall height), a
 * vaulted peak adds a gable triangle to both end walls (the width sides), and
 * skip areas (built-ins, cabinets, wide openings) are deducted by their own
 * width and height. Skip areas are measured, so they never block a net figure.
 */
export function computeAssessmentRoomGeometry(room: AssessmentRoom): AssessmentRoomGeometry {
  const length = positive(room.length_ft);
  const width = positive(room.width_ft);
  const height = positive(room.height_ft);
  const area = length !== null && width !== null ? length * width : null;
  const perimeter = length !== null && width !== null ? 2 * (length + width) : null;

  const openings = (room.openings ?? []).filter((o) => o.width_in > 0);
  const walls = (room.wall_lengths ?? []).filter((w) => w.length_ft > 0);
  const skips = (room.skip_areas ?? []).filter((a) => a.width_ft > 0 && a.height_ft > 0);
  const peak = height !== null && (room.peak_height_ft ?? 0) > height ? room.peak_height_ft! : null;
  const doors = count(room.door_count);
  const windows = count(room.window_count);
  const override =
    typeof room.wall_sqft_override === "number" && room.wall_sqft_override >= 0 ? room.wall_sqft_override : undefined;
  const openingsKnown = doors !== undefined && windows !== undefined;
  // Standard sizes and the assumed opening height make a deduction an estimate.
  const deductionBasis: QuantityBasis =
    (doors ?? 0) > 0 || (windows ?? 0) > 0 || openings.length > 0 ? "assumed" : "measured";

  let grossWall: number | null = null;
  if (height !== null && walls.length > 0) {
    grossWall = walls.reduce((sum, w) => sum + w.length_ft * height, 0);
  } else if (perimeter !== null && height !== null) {
    // Two gable ends, each a triangle of the room width by the rise above the walls.
    grossWall = perimeter * height + (peak !== null ? width! * (peak - height) : 0);
  }
  const skipSqft = skips.reduce((sum, a) => sum + a.width_ft * a.height_ft, 0);
  const deduction = openingsKnown
    ? doors * DOOR_DEDUCTION_SQFT +
      windows * WINDOW_DEDUCTION_SQFT +
      openings.reduce((sum, o) => sum + (o.width_in / 12) * (OPENING_HEIGHT_IN / 12), 0) +
      skipSqft
    : null;

  let netWall: RoomQuantity = UNKNOWN;
  if (override !== undefined) {
    netWall = { value: override, basis: "override" };
  } else if (grossWall !== null && deduction !== null) {
    netWall = { value: Math.max(0, grossWall - deduction), basis: deductionBasis };
  }

  // Baseboard skips doorways; windows do not affect it. Listed walls replace the perimeter.
  const baseRun = walls.length > 0 ? walls.reduce((sum, w) => sum + w.length_ft, 0) : perimeter;
  const baseboard =
    baseRun !== null && doors !== undefined
      ? {
          value: Math.max(
            0,
            baseRun - doors * DOOR_TRIM_DEDUCTION_LF - openings.reduce((sum, o) => sum + o.width_in / 12, 0),
          ),
          basis: (doors > 0 || openings.length > 0 ? "assumed" : "measured") as QuantityBasis,
        }
      : UNKNOWN;

  return {
    floor_sqft: measured(area),
    ceiling_sqft: measured(area),
    perimeter_lf: measured(perimeter),
    gross_wall_sqft: measured(grossWall),
    opening_deduction_sqft: deduction === null ? UNKNOWN : { value: deduction, basis: deductionBasis },
    net_wall_sqft: netWall,
    baseboard_lf: baseboard,
    openings_known: openingsKnown,
    max_wall_height_ft: peak ?? height,
    partial_walls: walls.length > 0,
    skip_area_sqft: skipSqft,
  };
}

/** Finish paint for a wall area: coats at standard coverage plus waste, whole gallons (TASK-184). */
export function wallPaintGallons(sqft: number, coats: number = 2): number {
  return sqft > 0 ? Math.ceil(((sqft * coats) / COVERAGE_SQFT_PER_GAL) * WASTE_FACTOR) : 0;
}

/**
 * Trim is converted to paint area at 0.5 sq ft per linear foot, the same
 * equivalent the room-by-room estimator uses (estimate-engine/painting.ts).
 */
export const TRIM_PAINT_SQFT_PER_LF = 0.5;

/** Finish paint for trim by length, through the area equivalent above (TASK-217). */
export function trimPaintGallons(linearFt: number, coats: number = 2): number {
  return wallPaintGallons(linearFt * TRIM_PAINT_SQFT_PER_LF, coats);
}

function roomPaint(room: RoomSpec, coatCount: number): { paint_gallons: number; primer_gallons: number } {
  const { wall_sqft, ceiling_sqft } = computeRoomMeasurements(room);
  const paint_gallons =
    room.paint_supplied_by === "dovetails"
      ? Math.ceil((((wall_sqft + ceiling_sqft) * coatCount) / COVERAGE_SQFT_PER_GAL) * WASTE_FACTOR)
      : 0;
  // Dark-to-light needs a second primer pass
  const primer_gallons = room.primer_needed
    ? Math.ceil((((wall_sqft + ceiling_sqft) * (room.dark_to_light ? 2 : 1)) / PRIMER_COVERAGE_SQFT_PER_GAL) * WASTE_FACTOR)
    : 0;
  return { paint_gallons, primer_gallons };
}

export function computePaintingMaterials(rooms: RoomSpec[], options: ProjectOptions): PaintingMaterials {
  const coatCount = options.coat_count ?? 2;
  let total_wall_sqft = 0;
  let total_ceiling_sqft = 0;
  let total_trim_lf = 0;
  let total_primer_gallons = 0;
  const gallonsByGrade: Partial<Record<PaintGrade, number>> = {};

  for (const room of rooms) {
    const m = computeRoomMeasurements(room);
    total_wall_sqft += m.wall_sqft;
    total_ceiling_sqft += m.ceiling_sqft;
    total_trim_lf += m.trim_lf;
    const { paint_gallons, primer_gallons } = roomPaint(room, coatCount);
    if (paint_gallons > 0) {
      gallonsByGrade[room.paint_grade] = (gallonsByGrade[room.paint_grade] ?? 0) + paint_gallons;
    }
    total_primer_gallons += primer_gallons;
  }

  const items: PaintingMaterials["items"] = [];
  for (const [grade, qty] of Object.entries(gallonsByGrade) as [PaintGrade, number][]) {
    items.push({ item: `Interior paint — ${grade}`, qty, unit: "gallon", cost_cents: qty * PAINT_CENTS_PER_GALLON[grade] });
  }
  if (total_primer_gallons > 0) {
    items.push({
      item: "Interior primer (ProMar 200 or equiv.)",
      qty: total_primer_gallons,
      unit: "gallon",
      cost_cents: total_primer_gallons * PRIMER_CENTS_PER_GALLON,
    });
  }

  return {
    total_wall_sqft,
    total_ceiling_sqft,
    total_trim_lf,
    total_paint_gallons: Object.values(gallonsByGrade).reduce((s, g) => s + g, 0),
    total_primer_gallons,
    material_cents: items.reduce((s, i) => s + i.cost_cents, 0),
    items,
  };
}
