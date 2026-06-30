/**
 * Adapters between legacy painting estimators and the unified estimate engine.
 * All money values are in CENTS.
 */

import {
  PREP_LEVEL_MULTIPLIERS,
  PAINTING_RATE_LABOR_CENTS,
  PAINTING_RATE_MIN_CENTS,
  PAINTING_TRIM_ADD_CENTS,
  MATERIAL_HANDLING_CLIENT_RATE,
  LABOR_COST_CENTS_PER_HOUR,
} from "../dovetails";
import {
  computePaintingProject,
  computeRoomMeasurements,
  type RoomSpec as PaintingRoomSpec,
  type ProjectOptions,
  type PaintGrade,
  type RoomPrepLevel,
} from "../painting";
import type { ShoppingList } from "../scope";
import { computeEstimate } from "./engine";
import { CURRENT_RULES, ENGINE_VERSION } from "./rules";
import type {
  AdjustmentSpec,
  EstimateSpec,
  EstimateResult,
  PaintQuality,
  PrepLevel,
  RoomSpec as EngineRoomSpec,
  SurfaceSpec,
} from "./types";

// ── Legacy sqft painting input (was apps/web/lib/estimates/pricing.ts) ───────

export interface SqftPaintingInput {
  sq_ft: number;
  prep_level: number;
  includes_trim: boolean;
  includes_ceiling: boolean;
  material_cost_cents: number;
  labor_hours_estimate: number;
  use_minimum_rate?: boolean;
}

export interface SqftPaintingResult {
  labor_flat_rate_cents: number;
  material_subtotal_cents: number;
  material_handling_cents: number;
  total_cents: number;
  deposit_cents: number;
  balance_cents: number;
  internal_labor_cost_cents: number;
  gross_margin_cents: number;
  gross_margin_pct: number;
  base_sq_ft_rate_cents: number;
  effective_sq_ft_rate_cents: number;
  prep_multiplier: number;
  trim_add_cents: number;
}

export interface LegacyPaintingFields {
  sq_ft: number;
  prep_level: number;
  includes_trim: boolean;
  includes_ceiling: boolean;
}

const PAINTING_PREP_TO_ENGINE: Record<RoomPrepLevel, PrepLevel> = {
  clean: "minor",
  minor: "minor",
  moderate: "moderate",
  major: "major",
};

const LEGACY_PREP_LEVEL_MAP: Record<RoomPrepLevel, number> = {
  clean: 1,
  minor: 3,
  moderate: 7,
  major: 10,
};

/** Legacy sqft painting formula — preserved for ±0-cent parity with calculatePaintingEstimate. */
export function computeSqftPaintingResult(input: SqftPaintingInput): SqftPaintingResult {
  const {
    sq_ft,
    prep_level,
    includes_trim,
    includes_ceiling,
    material_cost_cents,
    labor_hours_estimate,
    use_minimum_rate = false,
  } = input;

  const base_rate = use_minimum_rate ? PAINTING_RATE_MIN_CENTS : PAINTING_RATE_LABOR_CENTS;
  const prep_multiplier = PREP_LEVEL_MULTIPLIERS[Math.max(1, Math.min(10, prep_level))] ?? 1;
  const effective_rate = Math.round(base_rate * prep_multiplier);
  const effective_sq_ft = includes_ceiling ? sq_ft * 1.3 : sq_ft;
  const trim_add_cents = includes_trim ? Math.round(sq_ft * PAINTING_TRIM_ADD_CENTS) : 0;
  const labor_flat_rate_cents = Math.round(effective_sq_ft * effective_rate) + trim_add_cents;
  const material_subtotal_cents = material_cost_cents;
  const material_handling_cents = Math.round(material_subtotal_cents * MATERIAL_HANDLING_CLIENT_RATE);
  const total_cents = labor_flat_rate_cents + material_subtotal_cents + material_handling_cents;
  const internal_labor_cost_cents = Math.round(labor_hours_estimate * LABOR_COST_CENTS_PER_HOUR);
  const gross_margin_cents = labor_flat_rate_cents - internal_labor_cost_cents;
  const gross_margin_pct =
    labor_flat_rate_cents > 0
      ? Math.round((gross_margin_cents / labor_flat_rate_cents) * 100 * 10) / 10
      : 0;

  return {
    labor_flat_rate_cents,
    material_subtotal_cents,
    material_handling_cents,
    total_cents,
    deposit_cents: 0,
    balance_cents: total_cents,
    internal_labor_cost_cents,
    gross_margin_cents,
    gross_margin_pct,
    base_sq_ft_rate_cents: base_rate,
    effective_sq_ft_rate_cents: effective_rate,
    prep_multiplier,
    trim_add_cents,
  };
}

/**
 * Maps legacy sqft painting input → engine EstimateSpec.
 * Uses flat line items (not room surfaces) so engine auto-paint materials do not inflate totals.
 */
export function sqftPaintingToSpec(input: SqftPaintingInput): EstimateSpec {
  const legacy = computeSqftPaintingResult(input);
  const lineItems: EstimateSpec["lineItems"] = [
    {
      id: "painting-labor",
      description: "Painting labor",
      quantity: 1,
      unit: "flat",
      unitLaborCents: legacy.labor_flat_rate_cents,
    },
  ];
  if (input.material_cost_cents > 0) {
    lineItems.push({
      id: "painting-materials",
      description: "Materials & supplies",
      quantity: 1,
      unit: "flat",
      unitLaborCents: 0,
      materialCents: input.material_cost_cents,
    });
  }
  return {
    engineVersion: ENGINE_VERSION,
    type: "painting",
    lineItems,
  };
}

/** Run computeEstimate on sqft painting input and return legacy-shaped result fields. */
export function computeSqftPaintingEstimate(input: SqftPaintingInput): SqftPaintingResult {
  const legacy = computeSqftPaintingResult(input);
  const engine = computeEstimate(sqftPaintingToSpec(input), CURRENT_RULES);
  return {
    ...legacy,
    total_cents: engine.summary.totalCents,
    material_handling_cents: engine.summary.handlingCents,
    deposit_cents: engine.summary.depositCents,
    balance_cents: engine.summary.balanceDueCents,
  };
}

function dominantPaintQuality(rooms: PaintingRoomSpec[]): PaintQuality {
  const gradeCounts: Partial<Record<PaintGrade, number>> = {};
  for (const room of rooms) {
    if (room.paint_supplied_by === "dovetails") {
      gradeCounts[room.paint_grade] = (gradeCounts[room.paint_grade] ?? 0) + 1;
    }
  }
  const dominant = (Object.entries(gradeCounts) as [PaintGrade, number][])
    .sort(([, a], [, b]) => b - a)[0]?.[0];
  return dominant ?? "standard";
}

function engineCoatCount(projectCoatCount: number): number {
  return projectCoatCount <= 2 ? 1 : projectCoatCount - 1;
}

function buildEngineRooms(rooms: PaintingRoomSpec[], options: ProjectOptions): EngineRoomSpec[] {
  const coats = engineCoatCount(options.coat_count);
  return rooms.map((room, index) => {
    const measurements = computeRoomMeasurements(room);
    const prep = PAINTING_PREP_TO_ENGINE[room.prep_level];
    const surfaces: SurfaceSpec[] = [
      {
        type: "walls",
        sqft: measurements.wall_sqft,
        condition: "good",
        prep,
        prime: room.primer_needed || room.dark_to_light,
        textureMatch: false,
      },
    ];
    if (room.include_ceiling) {
      surfaces.push({
        type: "ceiling",
        sqft: measurements.ceiling_sqft,
        condition: "good",
        prep,
        prime: room.primer_needed,
        textureMatch: false,
      });
    }
    if (room.include_trim && measurements.trim_lf > 0) {
      surfaces.push({
        type: "trim",
        linearFt: measurements.trim_lf,
        condition: "good",
        prep,
        prime: false,
        textureMatch: false,
      });
    }
    return {
      id: `room-${index}`,
      name: room.name || `Room ${index + 1}`,
      coats,
      surfaces,
    };
  });
}

/**
 * Converts dimensional room specs (DB room_specs shape) → engine EstimateSpec.
 * Reconciles legacy vs engine coat/material/prime models via a parity adjustment when needed.
 */
export function roomSpecsToEstimateSpec(
  rooms: PaintingRoomSpec[],
  options: ProjectOptions,
  paintQuality?: PaintQuality
): EstimateSpec {
  const legacy = computePaintingProject(rooms, options);
  const spec: EstimateSpec = {
    engineVersion: ENGINE_VERSION,
    type: "painting",
    paintQuality: paintQuality ?? dominantPaintQuality(rooms),
    rooms: buildEngineRooms(rooms, options),
  };

  const enginePreview = computeEstimate(spec, CURRENT_RULES);
  const totalDelta = legacy.total_cents - enginePreview.summary.totalCents;
  if (totalDelta !== 0) {
    const adjustments: AdjustmentSpec[] = [
      {
        id: "legacy-parity",
        type: totalDelta > 0 ? "surcharge" : "discount",
        label: "Pricing reconciliation",
        amountCents: totalDelta,
      },
    ];
    spec.adjustments = adjustments;
  }

  return spec;
}

/** Mirror roomResultToLegacyFields — recovers legacy columns from source rooms. */
export function estimateResultToLegacyFields(
  _result: EstimateResult,
  sourceRooms: PaintingRoomSpec[]
): LegacyPaintingFields {
  let sq_ft = 0;
  let includes_trim = false;
  let includes_ceiling = false;
  const prepCounts: Partial<Record<RoomPrepLevel, number>> = {};

  for (const room of sourceRooms) {
    const measurements = computeRoomMeasurements(room);
    sq_ft += measurements.wall_sqft + measurements.ceiling_sqft;
    if (room.include_trim && measurements.trim_lf > 0) includes_trim = true;
    if (room.include_ceiling) includes_ceiling = true;
    prepCounts[room.prep_level] = (prepCounts[room.prep_level] ?? 0) + 1;
  }

  const dominantPrep =
    (Object.entries(prepCounts) as [RoomPrepLevel, number][])
      .sort(([, a], [, b]) => b - a)[0]?.[0] ?? "minor";

  return {
    sq_ft: Math.round(sq_ft),
    prep_level: LEGACY_PREP_LEVEL_MAP[dominantPrep],
    includes_trim,
    includes_ceiling,
  };
}

function buildShoppingSummaryFromRooms(
  rooms: PaintingRoomSpec[],
  options: ProjectOptions
): Array<{ item: string; qty: number; unit: string; cost_cents: number }> {
  const legacy = computePaintingProject(rooms, options);
  return legacy.shopping_summary;
}

/** Replaces buildShoppingListFromPaintingSummary for engine results. */
export function buildShoppingListFromEstimateResult(
  _result: EstimateResult,
  sourceRooms: PaintingRoomSpec[],
  options: ProjectOptions = { coat_count: 2, occupied_home: false, vaulted_ceilings: false }
): ShoppingList | null {
  const shoppingSummary = buildShoppingSummaryFromRooms(sourceRooms, options);
  if (!shoppingSummary.length) return null;

  const sectionTotal = shoppingSummary.reduce((sum, item) => sum + item.cost_cents, 0);

  return {
    sections: [
      {
        section: "Paint & Supplies",
        computed_items: [],
        specified_items: shoppingSummary.map((item) => ({
          name: item.item,
          sku: null,
          coverage_per_unit: null,
          unit_label: item.unit,
          unit_cost_cents: item.qty > 0 ? Math.round(item.cost_cents / item.qty) : null,
          quantity_needed: item.qty,
          waste_factor: 1.1,
          units_to_order: item.qty,
          store_section: "Paint & Supplies",
          service_code: "5012",
          notes: null,
        })),
        section_total_cents: sectionTotal,
      },
    ],
    total_catalog_cost_cents: 0,
    total_specified_cost_cents: sectionTotal,
    generated_at: new Date().toISOString(),
  };
}

