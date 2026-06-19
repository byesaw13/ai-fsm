/**
 * Location capture taxonomy — TASK-024.
 *
 * The Home Assistant Companion app feeds raw location events into FSM; those are
 * reduced into stop/drive segments the owner labels into the activity ledger.
 * These types are the shared contract between the ingest endpoint, the
 * segmentation reducer, and the UI.
 */

import type { ActivityType } from "./activities";

/** Raw event kinds emitted by the HA bridge. */
export const LOCATION_EVENT_KINDS = [
  "zone_enter",
  "zone_leave",
  "location_update",
  "activity_change",
] as const;
export type LocationEventKind = (typeof LOCATION_EVENT_KINDS)[number];

/** Detected motion activity (HA / OS activity recognition). */
export const DETECTED_ACTIVITIES = [
  "still",
  "walking",
  "running",
  "in_vehicle",
  "cycling",
  "unknown",
] as const;
export type DetectedActivity = (typeof DETECTED_ACTIVITIES)[number];

/** A derived day segment is either a stop (somewhere) or a drive (between). */
export const SEGMENT_KINDS = ["stop", "drive"] as const;
export type SegmentKind = (typeof SEGMENT_KINDS)[number];

/** Lifecycle of a derived segment. */
export const SEGMENT_STATUSES = ["provisional", "confirmed", "dismissed"] as const;
export type SegmentStatus = (typeof SEGMENT_STATUSES)[number];

/**
 * Default zone-name → activity_type hints. Zone names come from HA and are
 * matched case-insensitively. Intentionally conservative: only suggest where the
 * place strongly implies the activity; everything else is left for the owner to
 * label (no silent guessing — see TASK-024 out-of-scope).
 */
export interface ZoneActivityRule {
  match: RegExp;
  activity: ActivityType;
}

export const DEFAULT_ZONE_ACTIVITY_RULES: ZoneActivityRule[] = [
  // Supply houses / hardware → material run.
  {
    match: /supply|ferguson|home\s*depot|lowe'?s|hardware|warehouse|grainger|menards|ace\b/i,
    activity: "material_run",
  },
];

/** Suggest an activity_type from a zone name, or null if nothing matches. */
export function suggestActivityForZone(zone: string | null | undefined): ActivityType | null {
  if (!zone) return null;
  for (const rule of DEFAULT_ZONE_ACTIVITY_RULES) {
    if (rule.match.test(zone)) return rule.activity;
  }
  return null;
}

/**
 * Suggest an activity_type for a derived segment. Drives are always travel; a
 * stop is only auto-suggested when its zone is recognized — otherwise null so
 * the owner assigns it (e.g. job_work at a customer address).
 */
export function suggestActivityForSegment(input: {
  kind: SegmentKind;
  zone?: string | null;
}): ActivityType | null {
  if (input.kind === "drive") return "travel";
  return suggestActivityForZone(input.zone);
}
