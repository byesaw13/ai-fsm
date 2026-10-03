export type AreaCaptureStatus = "not_started" | "needs_confirmation" | "captured";

export type AreaRoom = {
  name: string | null;
  length_ft: number | null;
  width_ft: number | null;
  height_ft: number | null;
  notes: string | null;
};

function roomText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/** A named area with a note or a measurement is captured. A name alone still needs confirmation. */
export function areaCaptureStatus(room: AreaRoom): AreaCaptureStatus {
  if (!roomText(room.name)) return "not_started";
  const hasMeasure = room.length_ft != null || room.width_ft != null || room.height_ft != null;
  if (hasMeasure || roomText(room.notes).length > 0) return "captured";
  return "needs_confirmation";
}

export function areaStatusLabel(status: AreaCaptureStatus): string {
  if (status === "captured") return "Captured";
  if (status === "needs_confirmation") return "Needs confirmation";
  return "Not started";
}

export function assessmentAreaProgress(rooms: AreaRoom[]): {
  captured: number;
  needsConfirmation: number;
  notStarted: number;
} {
  const progress = { captured: 0, needsConfirmation: 0, notStarted: 0 };
  for (const room of rooms) {
    const status = areaCaptureStatus(room);
    if (status === "captured") progress.captured += 1;
    else if (status === "needs_confirmation") progress.needsConfirmation += 1;
    else progress.notStarted += 1;
  }
  return progress;
}
