/**
 * Labor hours for the room-by-room painting calculator (TASK-193 PR 2).
 *
 * Walls always use production rate 5012 (owner decision 2026-10-26), calibrated
 * or not. Trim uses rate 5003 only when the rate and every applied modifier are
 * calibrated. Everything else keeps the calculator's default pace
 * (0.85 hours per 100 sq ft per coat), which has no rate behind it.
 *
 * Rate 5012 is two finish coats, so wall hours scale by coats / 2. Wall height
 * uses the Craftsman factor Prepare Quote uses (owner approval G7, 2026-10-31).
 */

import { computeRoomMeasurements, type ProjectOptions, type RoomSpec } from "./painting";
import { wallHeightTimeFactor } from "./prepared-scope";
import { productionRateHours } from "./production-rates";

/** The calculator's pace when no rate applies: hours per 100 sq ft per coat. */
export const DEFAULT_PAINT_HOURS_PER_100_SQFT = 0.85;

export interface PaintingRateModifier {
  id: string;
  complexity_factor_key: string;
  modifier_pct: number;
  calibrated: boolean;
}

export interface PaintingRate {
  id: string;
  service_code: string;
  scope_component_key: string;
  base_rate: number;
  rate_unit: string;
  calibrated: boolean;
  modifiers: PaintingRateModifier[];
}

export interface PaintingRatePart {
  surface: "walls" | "trim";
  service_code: string;
  rate_id: string;
  base_rate: number;
  rate_unit: string;
  rate_calibrated: boolean;
  /** Area or length the rate was applied to, before height and coat factors. */
  quantity: number;
  modifiers: Array<{ id: string; key: string; modifier_pct: number; calibrated: boolean }>;
  hours: number;
  calibrated: boolean;
}

/** What the labor line saves in `production_rate_snapshot`. */
export interface PaintingRateSnapshot {
  version: 1;
  hours_per_day: number;
  coat_count: number;
  parts: PaintingRatePart[];
  /** Hours at the default pace, and the surfaces they cover. */
  default_hours: number;
  default_surfaces: Array<"walls" | "ceiling" | "trim">;
  total_hours: number;
}

export interface PaintingRateHours {
  /** Total hours to one decimal. */
  hours: number;
  /** True when rate 5012 drove the walls. */
  usesProductionRate: boolean;
  /** True when every rate part is calibrated and nothing used the default pace. */
  calibrated: boolean;
  snapshot: PaintingRateSnapshot;
}

/** Room and project flags that match a seeded modifier key. */
function appliedModifierKeys(room: RoomSpec, options: ProjectOptions): Set<string> {
  const keys = new Set<string>();
  if (room.dark_to_light) keys.add("dark_to_light");
  if (options.occupied_home) keys.add("occupied_home");
  if (options.vaulted_ceilings) keys.add("vaulted_ceilings");
  return keys;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function paintingRateHours(
  rooms: RoomSpec[],
  options: ProjectOptions,
  rates: PaintingRate[],
  hoursPerDay: number,
): PaintingRateHours {
  const coats = options.coat_count || 2;
  const wallRate = rates.find((r) => r.service_code === "5012" && r.scope_component_key === "wall_sqft") ?? null;
  const trimRate = rates.find((r) => r.service_code === "5003" && r.scope_component_key === "trim_linear_ft") ?? null;

  const parts: PaintingRatePart[] = [];
  let defaultSqft = 0;
  const defaultSurfaces = new Set<"walls" | "ceiling" | "trim">();

  for (const room of rooms) {
    if (!(room.length_ft > 0 && room.width_ft > 0)) continue;
    const m = computeRoomMeasurements(room);
    const keys = appliedModifierKeys(room, options);

    if (m.wall_sqft > 0) {
      if (wallRate) {
        const mods = wallRate.modifiers.filter((mod) => keys.has(mod.complexity_factor_key));
        const factor = wallHeightTimeFactor(room.ceiling_height_ft).factor;
        const result = productionRateHours(m.wall_sqft * factor * (coats / 2), wallRate, mods, hoursPerDay);
        parts.push({
          surface: "walls",
          service_code: wallRate.service_code,
          rate_id: wallRate.id,
          base_rate: wallRate.base_rate,
          rate_unit: wallRate.rate_unit,
          rate_calibrated: wallRate.calibrated,
          quantity: round2(m.wall_sqft),
          modifiers: mods.map((mod) => ({ id: mod.id, key: mod.complexity_factor_key, modifier_pct: mod.modifier_pct, calibrated: mod.calibrated })),
          hours: round2(result.hours),
          calibrated: result.calibrated,
        });
      } else {
        defaultSqft += m.wall_sqft;
        defaultSurfaces.add("walls");
      }
    }

    if (m.ceiling_sqft > 0) {
      defaultSqft += m.ceiling_sqft;
      defaultSurfaces.add("ceiling");
    }

    if (m.trim_lf > 0 && trimRate) {
      const mods = trimRate.modifiers.filter((mod) => keys.has(mod.complexity_factor_key));
      const result = productionRateHours(m.trim_lf * (coats / 2), trimRate, mods, hoursPerDay);
      // An uncalibrated trim rate leaves trim on the default, which has never counted trim.
      if (result.calibrated) {
        parts.push({
          surface: "trim",
          service_code: trimRate.service_code,
          rate_id: trimRate.id,
          base_rate: trimRate.base_rate,
          rate_unit: trimRate.rate_unit,
          rate_calibrated: trimRate.calibrated,
          quantity: round2(m.trim_lf),
          modifiers: mods.map((mod) => ({ id: mod.id, key: mod.complexity_factor_key, modifier_pct: mod.modifier_pct, calibrated: mod.calibrated })),
          hours: round2(result.hours),
          calibrated: true,
        });
      }
    }
  }

  const defaultHours = (defaultSqft / 100) * DEFAULT_PAINT_HOURS_PER_100_SQFT * coats;
  const rateHours = parts.reduce((sum, p) => sum + p.hours, 0);
  const total = round1(rateHours + defaultHours);

  return {
    hours: total,
    usesProductionRate: parts.some((p) => p.surface === "walls"),
    calibrated: parts.length > 0 && defaultHours === 0 && parts.every((p) => p.calibrated),
    snapshot: {
      version: 1,
      hours_per_day: hoursPerDay,
      coat_count: coats,
      parts,
      default_hours: round2(defaultHours),
      default_surfaces: [...defaultSurfaces],
      total_hours: total,
    },
  };
}
