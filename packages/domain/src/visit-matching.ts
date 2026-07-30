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

/**
 * Hard distance ceiling when property coords are known. Beyond this, a stop is
 * never a visit at that property — open-job / recent-client points must not
 * "teleport" a home stop onto a customer 50 km away (Brian Floss false positives).
 * ~800 m ≈ 0.5 mi: large rural lots + GPS drift OK; Derry↔Maynard is not.
 */
export const MAX_MATCH_DISTANCE_METERS = 800;

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
 * TASK-079: minimum on-site dwell before a stop becomes a visit candidate. Below
 * this, a stop is GPS jitter / a pass-through, not a visit — unless a visit is
 * scheduled there today (then even a brief arrival counts).
 */
export const VISIT_CANDIDATE_MIN_DWELL_MINUTES = 3;

/**
 * Should a closed stop become a pending visit candidate? Pure gate used by the
 * capture hook: enough confidence AND (real dwell OR a scheduled visit today).
 * When distance to the matched property is known and beyond the hard ceiling,
 * never create a candidate (schedule alone cannot invent on-site presence 50 km away).
 */
export function shouldCreateVisitCandidate(input: {
  score: number;
  durationMinutes: number;
  hasScheduledVisit: boolean;
  /** Distance to matched property when both have coords; omit if unknown. */
  distanceMeters?: number | null;
}): boolean {
  if (
    input.distanceMeters != null &&
    input.distanceMeters > MAX_MATCH_DISTANCE_METERS
  ) {
    return false;
  }
  if (input.score < VISIT_CONFIDENCE_FLOOR) return false;
  if (input.hasScheduledVisit) return true;
  return input.durationMinutes >= VISIT_CANDIDATE_MIN_DWELL_MINUTES;
}

/**
 * When a confirmed stop is farther than this from the stored property pin,
 * re-learn the geofence center from the stop (fixes first-confirm poison pins).
 */
export const PROPERTY_COORD_RELEARN_METERS = 500;

/** Default min on-site minutes before we auto-create a calendar field day. */
export const FIELD_DAY_MIN_DURATION_MINUTES = 15;

/** Classifications that mean billable/on-site field work for a job. */
export const FIELD_DAY_CLASSIFICATIONS = [
  "job_work",
  "warranty_callback",
] as const;

export type FieldDayClassification = (typeof FIELD_DAY_CLASSIFICATIONS)[number];

export function isFieldDayClassification(
  classification: string,
): classification is FieldDayClassification {
  return (FIELD_DAY_CLASSIFICATIONS as readonly string[]).includes(classification);
}

/**
 * Decide whether confirming a stop should ensure a calendar field-day visit
 * on the job (find existing day or auto-create). Short blips and non-field
 * classifications never create visits.
 */
export function shouldEnsureFieldDayVisit(opts: {
  classification: string;
  jobId: string | null | undefined;
  durationMinutes: number;
  minDurationMinutes?: number;
}): boolean {
  if (!opts.jobId) return false;
  if (!isFieldDayClassification(opts.classification)) return false;
  const min = opts.minDurationMinutes ?? FIELD_DAY_MIN_DURATION_MINUTES;
  return opts.durationMinutes >= min;
}

export type CoordRelearnDecision =
  | { relearn: true; reason: "missing"; distanceMeters: null }
  | { relearn: true; reason: "far"; distanceMeters: number }
  | { relearn: false; reason: "keep"; distanceMeters: number | null }
  | { relearn: false; reason: "no_stop_coords"; distanceMeters: null };

/**
 * Pure rule: bootstrap missing property coords, or overwrite when a confirmed
 * stop is far from the stored pin (poisoned learn-on-confirm).
 */
export function shouldRelearnPropertyCoords(opts: {
  storedLatitude: number | null | undefined;
  storedLongitude: number | null | undefined;
  stopLatitude: number | null | undefined;
  stopLongitude: number | null | undefined;
  relearnMeters?: number;
}): CoordRelearnDecision {
  if (opts.stopLatitude == null || opts.stopLongitude == null) {
    return { relearn: false, reason: "no_stop_coords", distanceMeters: null };
  }
  if (opts.storedLatitude == null || opts.storedLongitude == null) {
    return { relearn: true, reason: "missing", distanceMeters: null };
  }
  const distanceMeters = haversineMeters(
    { latitude: opts.storedLatitude, longitude: opts.storedLongitude },
    { latitude: opts.stopLatitude, longitude: opts.stopLongitude },
  );
  const threshold = opts.relearnMeters ?? PROPERTY_COORD_RELEARN_METERS;
  if (distanceMeters > threshold) {
    return { relearn: true, reason: "far", distanceMeters };
  }
  return { relearn: false, reason: "keep", distanceMeters };
}

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

    let distanceMeters: number | null = null;
    const canCheckDistance =
      stop.latitude != null &&
      stop.longitude != null &&
      c.latitude != null &&
      c.longitude != null;

    if (canCheckDistance) {
      distanceMeters = haversineMeters(
        { latitude: stop.latitude!, longitude: stop.longitude! },
        { latitude: c.latitude!, longitude: c.longitude! },
      );
      // Hard reject far stops — open-job points must not invent presence.
      if (distanceMeters > MAX_MATCH_DISTANCE_METERS) {
        return {
          propertyId: c.propertyId,
          clientId: c.clientId,
          jobId: c.jobId ?? null,
          visitId: c.visitId ?? null,
          distanceMeters,
          score: 0,
          rawScore: 0,
          reasons: ["too_far"],
        };
      }
    }

    if (c.scheduledToday) {
      raw += 100;
      reasons.push("scheduled_today");
    }

    if (canCheckDistance) {
      if (c.openJob) {
        raw += 75;
        reasons.push("open_job");
      }
      if (c.recentClient) {
        raw += 40;
        reasons.push("recent_client");
      }
      if (c.repeatClient) {
        raw += 30;
        reasons.push("repeat_client");
      }

      if (distanceMeters! <= WITHIN_NEAR_FEET * FEET_TO_METERS) {
        raw += 40;
        reasons.push("within_150ft");
      } else if (distanceMeters! <= WITHIN_FAR_FEET * FEET_TO_METERS) {
        raw += 25;
        reasons.push("within_250ft");
      }

      if (dwell) {
        raw += dwell.pts;
        reasons.push(dwell.reason);
      }
      if (c.supplierZone) {
        raw += 25;
        reasons.push("supplier_zone");
      }
      if (poorGps) {
        raw -= 25;
        reasons.push("poor_gps");
      }
    } else if (c.scheduledToday && dwell) {
      // Scheduled visit can match without learned coords; unscheduled jobs need distance proof.
      raw += dwell.pts;
      reasons.push(dwell.reason);
    }

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

// ---------------------------------------------------------------------------
// Arrival → Assignment Protocol (WO resolution + live prompt)
// ---------------------------------------------------------------------------

/** High bar for interrupting the tech with a live push/banner (stricter than VISIT_CONFIDENCE_FLOOR). */
export const LIVE_PROMPT_CONFIDENCE_FLOOR = 70;

export type OpenWorkOrderOption = {
  id: string;
  title: string;
  status: string;
  /** True if this WO has a non-cancelled visit scheduled for the stop's local day. */
  scheduledToday: boolean;
  visitId?: string | null;
};

export type WorkOrderResolution = {
  status: "clear" | "ambiguous" | "none";
  workOrderId: string | null;
  visitId: string | null;
  options: OpenWorkOrderOption[];
};

/**
 * Product rule: multiple open WOs → always ambiguous unless override picks one.
 * Single open WO → clear. Zero → none.
 */
export function resolveWorkOrderForProperty(input: {
  openWorkOrders: OpenWorkOrderOption[];
  overrideWorkOrderId?: string | null;
}): WorkOrderResolution {
  const options = input.openWorkOrders;
  if (input.overrideWorkOrderId) {
    const hit = options.find((o) => o.id === input.overrideWorkOrderId);
    if (hit) {
      return {
        status: "clear",
        workOrderId: hit.id,
        visitId: hit.visitId ?? null,
        options,
      };
    }
  }
  if (options.length === 0) {
    return { status: "none", workOrderId: null, visitId: null, options };
  }
  if (options.length === 1) {
    const only = options[0];
    return {
      status: "clear",
      workOrderId: only.id,
      visitId: only.visitId ?? null,
      options,
    };
  }
  return { status: "ambiguous", workOrderId: null, visitId: null, options };
}

export function isLivePromptEligible(input: {
  workdayOpen: boolean;
  confidenceScore: number;
  distanceProven: boolean;
  scheduledToday: boolean;
  alreadyPrompted: boolean;
  status: "pending" | "confirmed" | "ignored" | string;
}): boolean {
  if (input.status !== "pending") return false;
  if (input.alreadyPrompted) return false;
  if (!input.workdayOpen) return false;
  if (!input.scheduledToday) return false;
  if (!input.distanceProven) return false;
  if (input.confidenceScore < LIVE_PROMPT_CONFIDENCE_FLOOR) return false;
  return true;
}
