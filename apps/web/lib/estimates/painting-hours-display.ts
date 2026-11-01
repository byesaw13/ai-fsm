import type { PaintingRateHours } from "@ai-fsm/domain";
import { rateConversionLabel } from "./production-rate-display";

const SURFACE_WORDS: Record<string, string> = { walls: "walls", ceiling: "ceilings", trim: "trim" };

/**
 * Where the room-by-room calculator's hours came from (TASK-193), e.g.
 * "walls from production rate (uncalibrated), 400 sq ft a day = 50 sq ft an hour at 8 h a day; ceilings estimated".
 */
export function paintingHoursBasis(result: PaintingRateHours): string {
  const { snapshot } = result;
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const part of snapshot.parts) {
    if (seen.has(part.surface)) continue;
    seen.add(part.surface);
    const sameSurface = snapshot.parts.filter((p) => p.surface === part.surface);
    const calibrated = sameSurface.every((p) => p.calibrated);
    const modifiers = [...new Set(sameSurface.flatMap((p) => p.modifiers.map((m) => m.key.replace(/_/g, " "))))];
    parts.push(
      `${SURFACE_WORDS[part.surface]} from production rate${calibrated ? "" : " (uncalibrated)"}, ` +
        rateConversionLabel(part, snapshot.hours_per_day) +
        (modifiers.length ? `, slowed for ${modifiers.join(", ")}` : ""),
    );
  }
  if (snapshot.default_hours > 0) {
    const surfaces = snapshot.default_surfaces.map((s) => SURFACE_WORDS[s]).join(" and ");
    parts.push(`${surfaces} estimated at 0.85 h per 100 sq ft a coat (no calibrated rate)`);
  }
  return parts.join("; ");
}
