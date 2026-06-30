/**
 * Dovetails Services LLC — Room-by-room painting estimator.
 *
 * All money values are in CENTS.
 * Imported by the estimate builder and the PDF/print renderer.
 */

import {
  PAINTING_RATE_LABOR_CENTS,
  PAINTING_RATE_MIN_CENTS,
  PAINTING_TRIM_ADD_CENTS,
  MATERIAL_HANDLING_CLIENT_RATE,
  LABOR_COST_CENTS_PER_HOUR,
  PREP_LEVEL_MULTIPLIERS,
} from "./dovetails";

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

export interface RoomPaintingResult {
  room: RoomSpec;
  measurements: RoomMeasurements;
  labor_cents: number;
  paint_gallons: number;     // 0 if customer-supplied
  primer_gallons: number;    // 0 if primer_needed = false
  material_cents: number;    // based on paint_grade pricing
  subtotal_cents: number;    // labor + material
}

export interface PaintingProjectResult {
  rooms: RoomPaintingResult[];

  // Totals
  total_wall_sqft: number;
  total_ceiling_sqft: number;
  total_trim_lf: number;
  total_paint_gallons: number;
  total_primer_gallons: number;

  // Customer-facing pricing
  labor_cents: number;
  material_subtotal_cents: number;
  material_handling_cents: number;
  total_cents: number;
  deposit_cents: number;
  balance_cents: number;

  // Internal
  internal_labor_cost_cents: number;
  gross_margin_cents: number;
  gross_margin_pct: number;           // 0–100

  // Shopping list summary (for display; full list via buildShoppingList)
  shopping_summary: Array<{
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

const PAINT_CENTS_PER_GALLON: Record<PaintGrade, number> = {
  economy:  35_00,   // $35/gal
  standard: 55_00,   // $55/gal (Sherwin-Williams ProMar 200)
  premium:  75_00,   // $75/gal
  designer: 95_00,   // $95/gal
};

const PREP_MULTIPLIERS: Record<RoomPrepLevel, number> = {
  clean:    1.00,
  minor:    1.00,
  moderate: 1.14,
  major:    1.38,
};

// Estimated labor hours per 100 sqft at 2 coats (for internal cost)
const LABOR_HOURS_PER_100_SQFT = 0.85;

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

export function computeRoomPainting(room: RoomSpec, coatCount: number = 2): RoomPaintingResult {
  const measurements = computeRoomMeasurements(room);
  const { wall_sqft, ceiling_sqft, trim_lf } = measurements;

  const prep_mult = PREP_MULTIPLIERS[room.prep_level];

  // Labor: walls + ceiling + trim
  const wall_labor_cents = Math.round(wall_sqft * PAINTING_RATE_LABOR_CENTS * prep_mult);
  const ceiling_labor_cents = Math.round(ceiling_sqft * PAINTING_RATE_LABOR_CENTS * prep_mult);
  const trim_labor_cents = Math.round(trim_lf * PAINTING_TRIM_ADD_CENTS);
  // Extra coat adds 70% of base labor per additional coat beyond the standard 2
  const coat_mult = coatCount <= 2 ? 1 : 1 + (coatCount - 2) * 0.70;
  const labor_cents = Math.round((wall_labor_cents + ceiling_labor_cents + trim_labor_cents) * coat_mult);

  // Materials
  let paint_gallons = 0;
  let primer_gallons = 0;
  let material_cents = 0;

  if (room.paint_supplied_by === "dovetails") {
    const paintable_sqft = (wall_sqft + ceiling_sqft) * coatCount;
    paint_gallons = Math.ceil((paintable_sqft / COVERAGE_SQFT_PER_GAL) * WASTE_FACTOR);
    material_cents = paint_gallons * PAINT_CENTS_PER_GALLON[room.paint_grade];
  }

  if (room.primer_needed) {
    const primer_sqft = wall_sqft + ceiling_sqft;
    // Dark-to-light needs a second primer pass
    const primer_coats = room.dark_to_light ? 2 : 1;
    primer_gallons = Math.ceil(((primer_sqft * primer_coats) / PRIMER_COVERAGE_SQFT_PER_GAL) * WASTE_FACTOR);
    material_cents += primer_gallons * 48_00; // $48/gal primer (ProMar 200 Primer)
  }

  return {
    room,
    measurements,
    labor_cents,
    paint_gallons,
    primer_gallons,
    material_cents,
    subtotal_cents: labor_cents + material_cents,
  };
}

// ---------------------------------------------------------------------------
// Full project computation
// ---------------------------------------------------------------------------

export function computePaintingProject(
  rooms: RoomSpec[],
  options: ProjectOptions
): PaintingProjectResult {
  const { coat_count = 2 } = options;

  const roomResults = rooms.map((r) => computeRoomPainting(r, coat_count));

  const total_wall_sqft = roomResults.reduce((s, r) => s + r.measurements.wall_sqft, 0);
  const total_ceiling_sqft = roomResults.reduce((s, r) => s + r.measurements.ceiling_sqft, 0);
  const total_trim_lf = roomResults.reduce((s, r) => s + r.measurements.trim_lf, 0);
  const total_paint_gallons = roomResults.reduce((s, r) => s + r.paint_gallons, 0);
  const total_primer_gallons = roomResults.reduce((s, r) => s + r.primer_gallons, 0);

  const labor_cents = roomResults.reduce((s, r) => s + r.labor_cents, 0);
  const material_subtotal_cents = roomResults.reduce((s, r) => s + r.material_cents, 0);
  const material_handling_cents = Math.round(material_subtotal_cents * MATERIAL_HANDLING_CLIENT_RATE);

  const total_cents = labor_cents + material_subtotal_cents + material_handling_cents;
  const deposit_cents = 0;
  const balance_cents = total_cents;

  // Internal cost estimate (labor hours from production rate)
  const total_paintable_sqft = total_wall_sqft + total_ceiling_sqft;
  const est_hours = (total_paintable_sqft / 100) * LABOR_HOURS_PER_100_SQFT * coat_count;
  const internal_labor_cost_cents = Math.round(est_hours * LABOR_COST_CENTS_PER_HOUR);
  const gross_margin_cents = labor_cents - internal_labor_cost_cents;
  const gross_margin_pct =
    labor_cents > 0
      ? Math.round((gross_margin_cents / labor_cents) * 100 * 10) / 10
      : 0;

  // Shopping summary
  const shopping_summary: PaintingProjectResult["shopping_summary"] = [];
  if (total_paint_gallons > 0) {
    // Group by paint grade (use most common grade)
    const gradeCount: Partial<Record<PaintGrade, number>> = {};
    for (const r of roomResults) {
      if (r.room.paint_supplied_by === "dovetails") {
        gradeCount[r.room.paint_grade] = (gradeCount[r.room.paint_grade] ?? 0) + r.paint_gallons;
      }
    }
    for (const [grade, qty] of Object.entries(gradeCount) as [PaintGrade, number][]) {
      shopping_summary.push({
        item: `Interior paint — ${grade}`,
        qty,
        unit: "gallon",
        cost_cents: qty * PAINT_CENTS_PER_GALLON[grade],
      });
    }
  }
  if (total_primer_gallons > 0) {
    shopping_summary.push({
      item: "Interior primer (ProMar 200 or equiv.)",
      qty: total_primer_gallons,
      unit: "gallon",
      cost_cents: total_primer_gallons * 48_00,
    });
  }

  return {
    rooms: roomResults,
    total_wall_sqft,
    total_ceiling_sqft,
    total_trim_lf,
    total_paint_gallons,
    total_primer_gallons,
    labor_cents,
    material_subtotal_cents,
    material_handling_cents,
    total_cents,
    deposit_cents,
    balance_cents,
    internal_labor_cost_cents,
    gross_margin_cents,
    gross_margin_pct,
    shopping_summary,
  };
}

// ---------------------------------------------------------------------------
// PaintRoom — canonical room model with numeric prep levels
// ---------------------------------------------------------------------------
// Maps to the pricing contract's 1–10 numeric prep scale (PREP_LEVEL_MULTIPLIERS).
// Bridges to RoomSpec for computation while exposing the fields Dovetails
// actually uses during estimating: paintWalls, paintCeiling, paintTrim, brand info.

/** Prep level 1–10 matching PREP_LEVEL_MULTIPLIERS in dovetails.ts */
export type PrepLevelNumeric = 1|2|3|4|5|6|7|8|9|10;

/**
 * Canonical room model for the Dovetails painting estimator.
 * Uses the 1–10 numeric prep scale from the pricing contract.
 * Convert to RoomSpec via toPaintRoomSpec() for computation.
 */
export interface PaintRoom {
  id: string;
  name: string;

  lengthFt: number;
  widthFt: number;
  heightFt: number;

  windows: number;
  doors: number;

  paintWalls: boolean;
  paintCeiling: boolean;
  paintTrim: boolean;

  /** 1=no prep, 5=standard, 10=major resurfacing. Maps to PREP_LEVEL_MULTIPLIERS. */
  prepLevel: PrepLevelNumeric;

  primerRequired: boolean;

  /** When true, Dovetails does not supply paint — labor only */
  customerSuppliesPaint: boolean;

  paintBrand?: string;    // e.g. "Sherwin-Williams"
  paintLine?: string;     // e.g. "ProMar 200"
  paintGrade?: PaintGrade;
}

/** Full output for a single PaintRoom — includes labor hours for scheduling */
export interface PaintRoomOutput {
  room: PaintRoom;
  measurements: RoomMeasurements;
  wallArea: number;        // sqft (after deductions)
  ceilingArea: number;     // sqft
  trimArea: number;        // linear feet of baseboard/trim
  paintGallons: number;
  primerGallons: number;
  laborHours: number;      // estimated field hours at production rate
  laborCost: number;       // internal cost in cents (never shown to customer)
  materialCost: number;    // cents — paint + primer
  roomPrice: number;       // customer-facing price in cents
}

/** Map numeric 1–10 prep level to the string system used in computation */
export function numericPrepToRoomLevel(level: PrepLevelNumeric): RoomPrepLevel {
  if (level <= 3) return "clean";
  if (level <= 5) return "minor";
  if (level <= 7) return "moderate";
  return "major";
}

/** Convert PaintRoom → RoomSpec for use with existing computation functions */
export function toPaintRoomSpec(room: PaintRoom): RoomSpec {
  return {
    name: room.name,
    length_ft: room.lengthFt,
    width_ft: room.widthFt,
    ceiling_height_ft: room.heightFt,
    doors: room.doors,
    windows: room.windows,
    include_ceiling: room.paintCeiling,
    include_trim: room.paintTrim,
    prep_level: numericPrepToRoomLevel(room.prepLevel),
    paint_supplied_by: room.customerSuppliesPaint ? "customer" : "dovetails",
    paint_grade: room.paintGrade ?? "standard",
    primer_needed: room.primerRequired,
    dark_to_light: false,   // not in PaintRoom; set directly via RoomSpec if needed
  };
}

/** Compute a single PaintRoom and return full output including laborHours */
export function computePaintRoom(room: PaintRoom, coatCount = 2): PaintRoomOutput {
  const spec = toPaintRoomSpec(room);
  const result = computeRoomPainting(spec, coatCount);
  const measurements = result.measurements;

  // Apply paintWalls=false: subtract wall labor/materials if not painting walls
  const wallMultiplier = room.paintWalls ? 1 : 0;
  const effectiveWallSqft = measurements.wall_sqft * wallMultiplier;

  // Labor hours from production rate (0.85 hrs / 100 sqft at 2 coats, scaled by prep)
  const prepMult = PREP_LEVEL_MULTIPLIERS[room.prepLevel] ?? 1.0;
  const totalPaintableSqft = effectiveWallSqft + measurements.ceiling_sqft;
  const laborHours = parseFloat(
    ((totalPaintableSqft / 100) * LABOR_HOURS_PER_100_SQFT * coatCount * prepMult).toFixed(2)
  );
  const laborCost = Math.round(laborHours * LABOR_COST_CENTS_PER_HOUR);

  return {
    room,
    measurements,
    wallArea: measurements.wall_sqft,
    ceilingArea: measurements.ceiling_sqft,
    trimArea: measurements.trim_lf,
    paintGallons: result.paint_gallons,
    primerGallons: result.primer_gallons,
    laborHours,
    laborCost,
    materialCost: result.material_cents,
    roomPrice: room.paintWalls ? result.subtotal_cents : result.subtotal_cents - Math.round(measurements.wall_sqft * PAINTING_RATE_LABOR_CENTS * prepMult),
  };
}

/** Compute all PaintRooms and return project-level aggregates */
export function computePaintRooms(rooms: PaintRoom[], coatCount = 2): {
  rooms: PaintRoomOutput[];
  totalLaborHours: number;
  totalLaborCost: number;
  totalMaterialCost: number;
  totalPaintGallons: number;
  totalPrimerGallons: number;
  projectPrice: number;    // sum of room prices
  depositCents: number;
  balanceCents: number;
  grossMarginPct: number;
} {
  const outputs = rooms.map((r) => computePaintRoom(r, coatCount));
  const totalLaborHours = outputs.reduce((s, r) => s + r.laborHours, 0);
  const totalLaborCost = outputs.reduce((s, r) => s + r.laborCost, 0);
  const totalMaterialCost = outputs.reduce((s, r) => s + r.materialCost, 0);
  const totalPaintGallons = outputs.reduce((s, r) => s + r.paintGallons, 0);
  const totalPrimerGallons = outputs.reduce((s, r) => s + r.primerGallons, 0);
  const handlingCents = Math.round(totalMaterialCost * MATERIAL_HANDLING_CLIENT_RATE);
  const projectPrice = outputs.reduce((s, r) => s + r.roomPrice, 0) + handlingCents;
  const depositCents = 0;
  const balanceCents = projectPrice;
  const grossMarginPct = projectPrice > 0
    ? Math.round(((projectPrice - totalLaborCost - totalMaterialCost) / projectPrice) * 100)
    : 0;

  return {
    rooms: outputs,
    totalLaborHours: parseFloat(totalLaborHours.toFixed(2)),
    totalLaborCost,
    totalMaterialCost,
    totalPaintGallons,
    totalPrimerGallons,
    projectPrice,
    depositCents,
    balanceCents,
    grossMarginPct,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @deprecated Use estimateResultToLegacyFields from @ai-fsm/domain estimate-engine adapters.
 */
export function roomResultToLegacyFields(result: PaintingProjectResult): {
  sq_ft: number;
  prep_level: number;
  includes_trim: boolean;
  includes_ceiling: boolean;
} {
  const sq_ft = Math.round(result.total_wall_sqft + result.total_ceiling_sqft);
  const has_trim = result.rooms.some((r) => r.room.include_trim && r.measurements.trim_lf > 0);
  const has_ceiling = result.rooms.some((r) => r.room.include_ceiling);

  const prepCounts: Partial<Record<RoomPrepLevel, number>> = {};
  for (const r of result.rooms) {
    prepCounts[r.room.prep_level] = (prepCounts[r.room.prep_level] ?? 0) + 1;
  }
  const dominantPrep = (Object.entries(prepCounts) as [RoomPrepLevel, number][])
    .sort(([, a], [, b]) => b - a)[0]?.[0] ?? "minor";

  const prepLevelMap: Record<RoomPrepLevel, number> = {
    clean: 1,
    minor: 3,
    moderate: 7,
    major: 10,
  };

  return {
    sq_ft,
    prep_level: prepLevelMap[dominantPrep],
    includes_trim: has_trim,
    includes_ceiling: has_ceiling,
  };
}

/** Minimum estimate sanity check — is the total above the floor rate? */
export function isPaintingEstimateAboveFloor(result: PaintingProjectResult): boolean {
  const floorCents = (result.total_wall_sqft + result.total_ceiling_sqft) * PAINTING_RATE_MIN_CENTS;
  return result.labor_cents >= floorCents;
}
