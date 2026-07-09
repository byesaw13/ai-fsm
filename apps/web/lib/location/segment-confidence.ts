export type SegmentConfidenceLevel = "high" | "medium" | "low";

export type SegmentConfidenceInput = {
  kind: "stop" | "drive";
  zone?: string | null;
  place_label?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  ended_at?: string | null;
  vehicle_id?: string | null;
  estimated_miles?: number | null;
};

/** Operational confidence for location_segments list UI. */
export function segmentConfidenceLevel(seg: SegmentConfidenceInput): SegmentConfidenceLevel {
  if (seg.kind === "drive") {
    return seg.vehicle_id || seg.estimated_miles != null ? "high" : "medium";
  }
  const score =
    (seg.zone ? 2 : 0) +
    (seg.place_label ? 1 : 0) +
    (seg.latitude != null && seg.longitude != null ? 1 : 0) +
    (seg.ended_at ? 1 : 0);
  if (score >= 4) return "high";
  if (score >= 2) return "medium";
  return "low";
}
