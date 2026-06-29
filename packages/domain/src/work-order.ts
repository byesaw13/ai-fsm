/**
 * Work-order draft mapping (TASK-018).
 *
 * Pure maps from the canonical AssessmentSummary (and AI material suggestions)
 * into the editable work-order draft the Create-from-Assessment screen seeds.
 */

import type { AssessmentRoom, AssessmentSummary } from "./assessment-summary";

function formatRoomDimensions(room: AssessmentRoom): string | null {
  if (room.length_ft && room.width_ft) {
    let dims = `${room.length_ft} x ${room.width_ft} ft`;
    if (room.height_ft) dims += `, ${room.height_ft} ft ceiling`;
    return dims;
  }
  if (room.height_ft) return `${room.height_ft} ft ceiling`;
  return null;
}

export interface WorkOrderRoomLine {
  name: string;
  /** Human-readable dimensions, or null when not measured. */
  dimensions: string | null;
  description: string;
}

export interface WorkOrderMaterialDraft {
  description: string;
  quantity: number;
  unitCents: number;
  totalCents: number;
  /** True when this row was AI-suggested (vs owner-entered) and awaits confirm. */
  suggested: boolean;
}

export interface WorkOrderDraft {
  title: string;
  scope: string;
  /** Access / logistics notes (access notes, pets, difficult access). */
  siteNotes: string;
  /** Hazard notes (asbestos, lead paint). */
  safetyNotes: string;
  roomBreakdown: WorkOrderRoomLine[];
  materials: WorkOrderMaterialDraft[];
  /** Traceability back to the originating assessment (for the property timeline). */
  sourceVisitId: string | null;
  sourceAssessmentId: string | null;
}

/**
 * Build an editable work-order draft from a canonical assessment summary. Pure.
 * Materials start empty — the screen seeds suggestions on demand and the owner
 * confirms/edits them.
 */
export function buildWorkOrderDraft(summary: AssessmentSummary): WorkOrderDraft {
  const roomBreakdown: WorkOrderRoomLine[] = summary.rooms.map((r) => ({
    name: r.name || "Area",
    dimensions: formatRoomDimensions(r),
    description: (r.notes && r.notes.trim()) || `Work in ${r.name || "area"}`,
  }));

  const siteParts: string[] = [];
  if (summary.accessNotes && summary.accessNotes.trim()) siteParts.push(summary.accessNotes.trim());
  if (summary.hasPets) siteParts.push("Pets on site.");
  if (summary.difficultAccess) siteParts.push("Difficult access.");

  const safetyParts: string[] = [];
  if (summary.asbestosRisk) safetyParts.push("Asbestos risk — confirm before disturbing surfaces.");
  if (summary.leadPaintRisk) safetyParts.push("Lead paint risk — follow RRP precautions.");

  const roomCount = roomBreakdown.length;
  const title = roomCount > 0
    ? `Work order — ${roomCount} ${roomCount === 1 ? "area" : "areas"}`
    : "Work order";

  return {
    title,
    scope: summary.generatedJobDescription,
    siteNotes: siteParts.join(" "),
    safetyNotes: safetyParts.join(" "),
    roomBreakdown,
    materials: [],
    sourceVisitId: summary.visitId,
    sourceAssessmentId: summary.assessmentId,
  };
}

/** A material item from the AI materials generator (subset we map from). */
export interface SuggestedMaterialItem {
  name: string;
  brand?: string | null;
  quantity: number;
  unit?: string;
  unit_cost_cents: number;
  total_cost_cents: number;
}

/**
 * Map AI material suggestions into draft material rows the owner confirms/edits.
 * Pure — keeps the "suggested" provenance so the UI can mark them for review.
 */
export function materialItemsToDraft(items: SuggestedMaterialItem[]): WorkOrderMaterialDraft[] {
  return items.map((m) => ({
    description: `${m.name}${m.brand ? ` (${m.brand})` : ""}${m.unit ? ` — ${m.quantity} ${m.unit}` : ""}`.trim(),
    quantity: m.quantity > 0 ? m.quantity : 1,
    unitCents: Math.max(0, Math.round(m.unit_cost_cents)),
    totalCents: Math.max(0, Math.round(m.total_cost_cents)),
    suggested: true,
  }));
}
