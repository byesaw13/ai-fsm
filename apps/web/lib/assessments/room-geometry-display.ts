import type { AssessmentRoomGeometry } from "@ai-fsm/domain";

function fmt(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/**
 * Plain-language lines for a room's quantities on the assessment form. Shows
 * gross and net walls together and says why a number is missing, so a gross
 * figure is never read as net (TASK-178).
 */
export function roomGeometryLines(g: AssessmentRoomGeometry): string[] {
  const lines: string[] = [];
  if (g.floor_sqft.value !== null) lines.push(`Floor / ceiling ${fmt(g.floor_sqft.value)} sq ft`);

  const gross = g.gross_wall_sqft.value;
  const deduction = g.opening_deduction_sqft.value;
  if (g.net_wall_sqft.basis === "override" && g.net_wall_sqft.value !== null) {
    lines.push(`Walls ${fmt(g.net_wall_sqft.value)} sq ft (your override)`);
  } else if (gross === null) {
    if (g.perimeter_lf.value !== null) lines.push("Walls: add a height to calculate");
  } else if (deduction === null || g.net_wall_sqft.value === null) {
    lines.push(`Walls ${fmt(gross)} sq ft gross · doors and windows not counted, nothing deducted`);
  } else {
    const assumed = g.opening_deduction_sqft.basis === "assumed" ? " (standard sizes assumed)" : "";
    lines.push(`Walls ${fmt(gross)} gross − ${fmt(deduction)} openings = ${fmt(g.net_wall_sqft.value)} sq ft${assumed}`);
  }

  if (g.baseboard_lf.value !== null) {
    const skipped = g.baseboard_lf.basis === "assumed" ? " (doorways skipped)" : "";
    lines.push(`Baseboard ${fmt(g.baseboard_lf.value)} LF${skipped}`);
  } else if (g.perimeter_lf.value !== null) {
    lines.push(`Perimeter ${fmt(g.perimeter_lf.value)} LF · count doors for baseboard`);
  }
  return lines;
}
