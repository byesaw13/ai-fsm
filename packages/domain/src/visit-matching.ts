/**
 * Visit detection — customer/property matching (EPIC-007, TASK-042).
 *
 * Turns a closed STOP segment into a ranked set of "which customer/property is
 * this, and how sure are we" matches. Pure — the single source of truth shared
 * by the capture hook and its tests. Distance/geofence scoring only contributes
 * once a property has learned coordinates (schedule-first; see EPIC-007).
 */

import { haversineMeters } from "./geo";
import type { ActivityType } from "./activities";

const FEET_TO_METERS = 0.3048;
const WITHIN_NEAR_FEET = 150;
const WITHIN_FAR_FEET = 250;
const POOR_GPS_METERS = 75;

/** A candidate property (+ its job/visit/client signals) to score a stop against. */
export interface VisitMatchCandidate {
  propertyId: string;
  clientId: string;
  /** Learned property coordinates, or null until bootstrapped via learn-on-confirm. */
  latitude: number | null;
  longitude: number | null;
  /** A job or visit scheduled for today at this property. */
  scheduledToday?: boolean;
  /** An open job (status scheduled/in_progress) at this property. */
  openJob?: boolean;
  jobId?: string | null;
  visitId?: string | null;
  /** Client had a job/visit in the recency window (~30d). */
  recentClient?: boolean;
  /** Client has more than one job. */
  repeatClient?: boolean;
  /** Property/zone is a known supplier. */
  supplierZone?: boolean;
}

export interface VisitMatchInput {
  stop: {
    latitude: number | null;
    longitude: number | null;
    durationMinutes: number;
    gpsAccuracyMeters?: number | null;
  };
  candidates: VisitMatchCandidate[];
}

export interface VisitMatch {
  propertyId: string;
  clientId: string;
  jobId: string | null;
  visitId: string | null;
  distanceMeters: number | null;
  /** Clamped 0–100 for storage/display. */
  score: number;
  /** Uncapped additive points (for ranking / debugging). */
  rawScore: number;
  reasons: string[];
}

/** Minimum confidence for the capture hook to persist a candidate. */
export const VISIT_CONFIDENCE_FLOOR = 40;

/**
 * Score + rank candidate properties for a closed stop. Weights follow the
 * EPIC-007 spec; distance terms only apply when both the stop and the property
 * have coordinates.
 */
export function rankVisitCandidates(input: VisitMatchInput): VisitMatch[] {
  const { stop, candidates } = input;
  const poorGps = (stop.gpsAccuracyMeters ?? 0) > POOR_GPS_METERS;

  const dwell =
    stop.durationMinutes >= 15 ? { pts: 30, reason: "stayed_15min" }
    : stop.durationMinutes >= 5 ? { pts: 20, reason: "stayed_5min" }
    : null;

  const matches = candidates.map((c): VisitMatch => {
    let raw = 0;
    const reasons: string[] = [];

    if (c.scheduledToday) { raw += 100; reasons.push("scheduled_today"); }
    if (c.openJob) { raw += 75; reasons.push("open_job"); }
    if (c.recentClient) { raw += 40; reasons.push("recent_client"); }
    if (c.repeatClient) { raw += 30; reasons.push("repeat_client"); }

    let distanceMeters: number | null = null;
    if (stop.latitude != null && stop.longitude != null && c.latitude != null && c.longitude != null) {
      distanceMeters = haversineMeters(
        { latitude: stop.latitude, longitude: stop.longitude },
        { latitude: c.latitude, longitude: c.longitude },
      );
      if (distanceMeters <= WITHIN_NEAR_FEET * FEET_TO_METERS) { raw += 40; reasons.push("within_150ft"); }
      else if (distanceMeters <= WITHIN_FAR_FEET * FEET_TO_METERS) { raw += 25; reasons.push("within_250ft"); }
    }

    if (dwell) { raw += dwell.pts; reasons.push(dwell.reason); }
    if (c.supplierZone) { raw += 25; reasons.push("supplier_zone"); }
    if (poorGps) { raw -= 25; reasons.push("poor_gps"); }

    return {
      propertyId: c.propertyId,
      clientId: c.clientId,
      jobId: c.jobId ?? null,
      visitId: c.visitId ?? null,
      distanceMeters,
      score: Math.max(0, Math.min(100, raw)),
      rawScore: raw,
      reasons,
    };
  });

  return matches.sort(
    (a, b) => b.rawScore - a.rawScore || (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity),
  );
}

// ---------------------------------------------------------------------------
// Classification taxonomy → ledger activity type
// ---------------------------------------------------------------------------

export const VISIT_CLASSIFICATIONS = [
  "job_work",
  "warranty_callback",
  "estimate_visit",
  "walkthrough",
  "material_drop",
  "realtor",
  "ignore",
] as const;
export type VisitClassification = (typeof VISIT_CLASSIFICATIONS)[number];

/**
 * Map a confirmed visit classification to the nearest existing ledger
 * activity_type. The precise classification is preserved on the candidate;
 * "ignore" produces no ledger entry.
 */
export const CLASSIFICATION_TO_ACTIVITY: Record<Exclude<VisitClassification, "ignore">, ActivityType> = {
  job_work: "job_work",
  warranty_callback: "job_work",
  estimate_visit: "estimate_visit",
  walkthrough: "estimate_visit",
  material_drop: "material_run",
  realtor: "follow_up",
};
