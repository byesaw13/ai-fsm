import { describe, it, expect } from "vitest";
import { computeEstimate } from "./engine";
import { CURRENT_RULES } from "./rules";
import {
  sqftPaintingToSpec,
  roomSpecsToEstimateSpec,
  estimateResultToLegacyFields,
  buildShoppingListFromEstimateResult,
  computeSqftPaintingResult,
} from "./adapters";
import {
  computePaintingProject,
  roomResultToLegacyFields,
  type RoomSpec as PaintingRoomSpec,
  type ProjectOptions,
} from "../painting";
import type { SqftPaintingInput } from "./adapters";

const SQFT_FIXTURES: SqftPaintingInput[] = [
  { sq_ft: 500, prep_level: 1, includes_trim: false, includes_ceiling: false, material_cost_cents: 0, labor_hours_estimate: 4 },
  { sq_ft: 500, prep_level: 1, includes_trim: true, includes_ceiling: true, material_cost_cents: 10000, labor_hours_estimate: 4 },
  { sq_ft: 1000, prep_level: 5, includes_trim: false, includes_ceiling: true, material_cost_cents: 25000, labor_hours_estimate: 8 },
  { sq_ft: 2000, prep_level: 7, includes_trim: true, includes_ceiling: false, material_cost_cents: 50000, labor_hours_estimate: 16 },
  { sq_ft: 750, prep_level: 10, includes_trim: true, includes_ceiling: true, material_cost_cents: 15000, labor_hours_estimate: 6 },
  { sq_ft: 350, prep_level: 3, includes_trim: false, includes_ceiling: false, material_cost_cents: 5000, labor_hours_estimate: 3 },
  { sq_ft: 1200, prep_level: 6, includes_trim: true, includes_ceiling: false, material_cost_cents: 0, labor_hours_estimate: 10 },
  { sq_ft: 800, prep_level: 8, includes_trim: false, includes_ceiling: true, material_cost_cents: 12000, labor_hours_estimate: 7 },
  { sq_ft: 1500, prep_level: 9, includes_trim: true, includes_ceiling: true, material_cost_cents: 30000, labor_hours_estimate: 12 },
  { sq_ft: 600, prep_level: 4, includes_trim: true, includes_ceiling: false, material_cost_cents: 8000, labor_hours_estimate: 5, use_minimum_rate: true },
];

const ROOM_FIXTURES: Array<{ rooms: PaintingRoomSpec[]; options: ProjectOptions }> = [
  {
    rooms: [
      {
        name: "Living Room",
        length_ft: 14,
        width_ft: 12,
        ceiling_height_ft: 8,
        doors: 2,
        windows: 2,
        include_ceiling: true,
        include_trim: true,
        prep_level: "minor",
        paint_supplied_by: "dovetails",
        paint_grade: "standard",
        primer_needed: false,
        dark_to_light: false,
      },
      {
        name: "Bedroom",
        length_ft: 11,
        width_ft: 10,
        ceiling_height_ft: 8,
        doors: 1,
        windows: 1,
        include_ceiling: false,
        include_trim: false,
        prep_level: "clean",
        paint_supplied_by: "dovetails",
        paint_grade: "standard",
        primer_needed: false,
        dark_to_light: false,
      },
    ],
    options: { coat_count: 2, occupied_home: false, vaulted_ceilings: false },
  },
  {
    rooms: [
      {
        name: "Master Bedroom",
        length_ft: 14,
        width_ft: 13,
        ceiling_height_ft: 8,
        doors: 1,
        windows: 2,
        include_ceiling: true,
        include_trim: true,
        prep_level: "moderate",
        paint_supplied_by: "dovetails",
        paint_grade: "premium",
        primer_needed: true,
        dark_to_light: false,
      },
    ],
    options: { coat_count: 2, occupied_home: true, vaulted_ceilings: false },
  },
  {
    rooms: [
      {
        name: "Hallway",
        length_ft: 15,
        width_ft: 4,
        ceiling_height_ft: 8,
        doors: 2,
        windows: 0,
        include_ceiling: false,
        include_trim: true,
        prep_level: "clean",
        paint_supplied_by: "customer",
        paint_grade: "standard",
        primer_needed: false,
        dark_to_light: false,
      },
      {
        name: "Kitchen",
        length_ft: 12,
        width_ft: 10,
        ceiling_height_ft: 8,
        doors: 2,
        windows: 1,
        include_ceiling: true,
        include_trim: true,
        prep_level: "major",
        paint_supplied_by: "dovetails",
        paint_grade: "designer",
        primer_needed: true,
        dark_to_light: true,
      },
    ],
    options: { coat_count: 3, occupied_home: false, vaulted_ceilings: true },
  },
];

describe("pricing parity — sqft calculatePaintingEstimate", () => {
  for (const [index, input] of SQFT_FIXTURES.entries()) {
    it(`fixture ${index + 1}: totalCents matches legacy (±0 cents)`, () => {
      const legacy = computeSqftPaintingResult(input);
      const engine = computeEstimate(sqftPaintingToSpec(input), CURRENT_RULES);
      expect(engine.summary.totalCents).toBe(legacy.total_cents);
    });
  }
});

describe("pricing parity — room-by-room computePaintingProject", () => {
  for (const [index, fixture] of ROOM_FIXTURES.entries()) {
    it(`fixture ${index + 1}: totalCents matches legacy (±0 cents)`, () => {
      const legacy = computePaintingProject(fixture.rooms, fixture.options);
      const spec = roomSpecsToEstimateSpec(fixture.rooms, fixture.options);
      const engine = computeEstimate(spec, CURRENT_RULES);
      expect(engine.summary.totalCents).toBe(legacy.total_cents);
    });
  }
});

describe("pricing parity — estimateResultToLegacyFields", () => {
  for (const fixture of ROOM_FIXTURES) {
    it(`legacy fields match for ${fixture.rooms.map((r) => r.name).join(" + ")}`, () => {
      const legacy = computePaintingProject(fixture.rooms, fixture.options);
      const spec = roomSpecsToEstimateSpec(fixture.rooms, fixture.options);
      const engine = computeEstimate(spec, CURRENT_RULES);
      const fromLegacy = roomResultToLegacyFields(legacy);
      const fromEngine = estimateResultToLegacyFields(engine, fixture.rooms);
      expect(fromEngine).toEqual(fromLegacy);
    });
  }
});

describe("pricing parity — shopping list", () => {
  for (const fixture of ROOM_FIXTURES) {
    it(`shopping list matches for ${fixture.rooms.map((r) => r.name).join(" + ")}`, () => {
      const legacy = computePaintingProject(fixture.rooms, fixture.options);
      const spec = roomSpecsToEstimateSpec(fixture.rooms, fixture.options);
      const engine = computeEstimate(spec, CURRENT_RULES);
      const sl = buildShoppingListFromEstimateResult(engine, fixture.rooms, fixture.options);

      expect(sl).not.toBeNull();
      expect(sl!.sections).toHaveLength(1);
      expect(sl!.sections[0].specified_items).toHaveLength(legacy.shopping_summary.length);

      for (let i = 0; i < legacy.shopping_summary.length; i++) {
        const legacyItem = legacy.shopping_summary[i];
        const engineItem = sl!.sections[0].specified_items[i];
        expect(engineItem.name).toBe(legacyItem.item);
        expect(engineItem.quantity_needed).toBe(legacyItem.qty);
        expect(engineItem.unit_label).toBe(legacyItem.unit);
        const engineCost = (engineItem.unit_cost_cents ?? 0) * engineItem.quantity_needed;
        expect(engineCost).toBe(legacyItem.cost_cents);
      }

      expect(sl!.total_specified_cost_cents).toBe(
        legacy.shopping_summary.reduce((sum, item) => sum + item.cost_cents, 0)
      );
    });
  }
});

describe("roomSpecsToEstimateSpec — 2-room worked example", () => {
  it("maps surfaces from computeRoomMeasurements and matches legacy total", () => {
    const rooms = ROOM_FIXTURES[0].rooms;
    const options = ROOM_FIXTURES[0].options;
    const spec = roomSpecsToEstimateSpec(rooms, options);

    expect(spec.rooms).toHaveLength(2);
    expect(spec.rooms![0].surfaces.some((s) => s.type === "walls")).toBe(true);
    expect(spec.rooms![0].surfaces.some((s) => s.type === "ceiling")).toBe(true);
    expect(spec.rooms![0].surfaces.some((s) => s.type === "trim")).toBe(true);
    expect(spec.rooms![1].surfaces.some((s) => s.type === "ceiling")).toBe(false);

    const legacy = computePaintingProject(rooms, options);
    const engine = computeEstimate(spec, CURRENT_RULES);
    expect(engine.summary.totalCents).toBe(legacy.total_cents);
  });
});