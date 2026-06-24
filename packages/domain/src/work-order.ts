/**
 * Work-order draft mapping (TASK-018 slice 2).
 *
 * A pure map from the canonical AssessmentSummary into a work-order draft shape.
 * This exists so a future work-order UI has a ready contract to consume — it is
 * NOT wired into any UI yet (out of scope for this slice).
 */

import type { AssessmentRoom, AssessmentSummary } from "./assessment-summary";

export interface WorkOrderTask {
  /** Room/area this task is for, or null when it isn't room-specific. */
  room: string | null;
  description: string;
}

export interface WorkOrderDraft {
  title: string;
  scopeDescription: string;
  rooms: AssessmentRoom[];
  tasks: WorkOrderTask[];
  /** Site conditions surfaced from the assessment (pets, access, risks). */
  siteConditions: string[];
  /** Traceability back to the originating assessment. */
  sourceVisitId: string | null;
  sourceAssessmentId: string | null;
}

/** Build a work-order draft from a canonical assessment summary. Pure. */
export function buildWorkOrderDraft(summary: AssessmentSummary): WorkOrderDraft {
  const rooms = summary.rooms;
  const tasks: WorkOrderTask[] = rooms.map((r) => ({
    room: r.name || null,
    description: (r.notes && r.notes.trim()) || `Work in ${r.name || "area"}`,
  }));

  const siteConditions: string[] = [];
  if (summary.hasPets) siteConditions.push("pets on site");
  if (summary.difficultAccess) siteConditions.push("difficult access");
  if (summary.asbestosRisk) siteConditions.push("asbestos risk");
  if (summary.leadPaintRisk) siteConditions.push("lead paint risk");

  const roomCount = rooms.length;
  const title = roomCount > 0
    ? `Work order — ${roomCount} ${roomCount === 1 ? "area" : "areas"}`
    : "Work order";

  return {
    title,
    scopeDescription: summary.generatedJobDescription,
    rooms,
    tasks,
    siteConditions,
    sourceVisitId: summary.visitId,
    sourceAssessmentId: summary.assessmentId,
  };
}
