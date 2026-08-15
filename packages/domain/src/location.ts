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
  // TASK-025: phone connected/disconnected a known vehicle's Bluetooth.
  "vehicle_connect",
  "vehicle_disconnect",
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

// ---------------------------------------------------------------------------
// False-drive detection
// ---------------------------------------------------------------------------

/**
 * How a captured drive looks once it closes:
 * - "noise"   → the vehicle never really went anywhere (parked Bluetooth cycle,
 *               GPS drift, or a sub-minute/teleport blip). Auto-dismissed.
 * - "suspect" → borderline, below walking pace (1–3 km/h). Kept but flagged so
 *               the owner can clear it in one tap.
 * - "ok"      → a real trip (or distance unknown, so we can't judge — keep it).
 */
export type DriveClassification = "ok" | "suspect" | "noise";

const NOISE_MAX_KMH = 1; // at/under this, the vehicle didn't really move
const SUSPECT_MAX_KMH = 3; // below walking pace — borderline
const MIN_DRIVE_SECONDS = 60; // shorter than this is a blip/teleport, not a trip

/**
 * Classify a closed drive by its average speed. Pure — the single source of
 * truth shared by the capture route and the backfill migration.
 */
export function classifyDrive(input: {
  distanceMeters: number | null;
  durationSeconds: number;
}): DriveClassification {
  const { distanceMeters, durationSeconds } = input;
  if (durationSeconds < MIN_DRIVE_SECONDS) return "noise";
  // Distance unknown (too few GPS points) → can't judge; keep the drive.
  if (distanceMeters == null) return "ok";
  const avgKmh = distanceMeters / 1000 / (durationSeconds / 3600);
  if (avgKmh < NOISE_MAX_KMH) return "noise";
  if (avgKmh < SUSPECT_MAX_KMH) return "suspect";
  return "ok";
}

// ---------------------------------------------------------------------------
// False-stop detection (HA still / zone flicker)
// ---------------------------------------------------------------------------

/**
 * How a captured stop looks once it closes:
 * - "noise" → shorter than the reportable dwell (traffic-light still, GPS
 *             zone flicker, a 30-second "stopped" blip). Auto-dismissed.
 * - "ok"    → long enough to be a real stay, or a scheduled visit was there
 *             today (even a brief arrival counts).
 *
 * Unlike drives there is no suspect band: a 4-minute flicker is not a
 * review item. The owner asked for a 5-minute reporting floor.
 */
export type StopClassification = "ok" | "noise";

/** Product rule: a stop shorter than this is HA jitter, not a reportable stay. */
export const MIN_STOP_SECONDS = 5 * 60;

/**
 * Classify a closed stop by dwell. Pure — the single source of truth shared
 * by the capture route, the visit-candidate dwell floor, and the backfill
 * migration.
 */
export function classifyStop(input: {
  durationSeconds: number;
  hasScheduledVisit?: boolean;
}): StopClassification {
  if (input.hasScheduledVisit) return "ok";
  if (input.durationSeconds < MIN_STOP_SECONDS) return "noise";
  return "ok";
}

// ---------------------------------------------------------------------------
// Privacy (TASK-046): home/private zones must not surface in reports or maps.
// ---------------------------------------------------------------------------

/** True when a segment's zone or label is a private/home place (HA zones). */
export function isPrivateLocation(
  zone: string | null | undefined,
  placeLabel: string | null | undefined,
): boolean {
  const z = (zone ?? "").trim().toLowerCase();
  const p = (placeLabel ?? "").trim().toLowerCase();
  if (z === "home" || p === "home") return true;
  if (z === "private" || p === "private") return true;
  return false;
}
