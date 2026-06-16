/**
 * Assessment → estimate hand-off context.
 *
 * When a user moves from a site assessment into estimate creation, we carry
 * the generated job description and room measurements across the navigation
 * via sessionStorage so the estimate-page materials generator keeps full
 * assessment context instead of asking for a manual description again.
 *
 * This is a transient UI hand-off only — no persistence, no new tables.
 */

export const ASSESSMENT_CONTEXT_KEY = "dovetails.assessmentContext";

/** Room shape MaterialsGenerator expects (RoomMeasurement). */
export interface AssessmentContextRoom {
  id: string;
  name: string;
  length_ft: number | null;
  width_ft: number | null;
  height_ft: number | null;
  notes: string;
}

export interface AssessmentContext {
  generatedJobDescription: string;
  rooms: AssessmentContextRoom[];
  visitId?: string | null;
  assessmentId?: string | null;
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Normalize arbitrary room-ish objects to the exact shape MaterialsGenerator
 * expects. Tolerant of missing/extra fields so it is safe to feed assessment
 * form rooms or rehydrated sessionStorage data.
 */
export function normalizeAssessmentRooms(rooms: unknown): AssessmentContextRoom[] {
  if (!Array.isArray(rooms)) return [];
  return rooms.map((raw) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    return {
      id: typeof r.id === "string" ? r.id : "",
      name: typeof r.name === "string" ? r.name : "",
      length_ft: toNullableNumber(r.length_ft),
      width_ft: toNullableNumber(r.width_ft),
      height_ft: toNullableNumber(r.height_ft),
      notes: typeof r.notes === "string" ? r.notes : "",
    };
  });
}

/** Persist assessment context for the estimate page to pick up. No-op on the server. */
export function writeAssessmentContext(context: AssessmentContext): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      ASSESSMENT_CONTEXT_KEY,
      JSON.stringify({
        generatedJobDescription: context.generatedJobDescription ?? "",
        rooms: normalizeAssessmentRooms(context.rooms),
        visitId: context.visitId ?? null,
        assessmentId: context.assessmentId ?? null,
      })
    );
  } catch {
    /* sessionStorage unavailable — hand-off is best-effort */
  }
}

/**
 * Read assessment context. Returns null when absent or malformed.
 * Does not clear — call clearAssessmentContext() to drop it once consumed.
 */
export function readAssessmentContext(): AssessmentContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ASSESSMENT_CONTEXT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      generatedJobDescription:
        typeof parsed.generatedJobDescription === "string" ? parsed.generatedJobDescription : "",
      rooms: normalizeAssessmentRooms(parsed.rooms),
      visitId: typeof parsed.visitId === "string" ? parsed.visitId : null,
      assessmentId: typeof parsed.assessmentId === "string" ? parsed.assessmentId : null,
    };
  } catch {
    return null;
  }
}

/** Remove stored assessment context. */
export function clearAssessmentContext(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(ASSESSMENT_CONTEXT_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Consume the assessment hand-off for an estimate-form mount.
 *
 * The context is ALWAYS cleared from storage so it can never linger and leak
 * into a later, unrelated estimate — but it is only *returned* (and thus used
 * to prefill) when the estimate was actually opened from an assessment
 * (`from_assessment=1`). Opening a fresh estimate any other way drops any stale
 * context on the floor instead of inheriting it.
 *
 * Dependencies are injectable so the policy can be unit-tested without a DOM.
 */
export function consumeAssessmentContext(
  fromAssessment: boolean,
  deps: { read: () => AssessmentContext | null; clear: () => void } = {
    read: readAssessmentContext,
    clear: clearAssessmentContext,
  },
): AssessmentContext | null {
  const ctx = deps.read();
  deps.clear();
  return fromAssessment ? ctx : null;
}
