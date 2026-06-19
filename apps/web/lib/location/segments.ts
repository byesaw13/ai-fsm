/**
 * Location segmentation reducer — TASK-024.
 *
 * Pure, DB-free state machine that turns one incoming HA location event plus the
 * currently-open segment into a set of mutations the ingest route applies. Kept
 * pure so the day-segmenting logic is fully unit-testable.
 *
 * Model: at any moment there is at most one open segment — either a `stop`
 * (parked somewhere) or a `drive` (moving between places). Events open/close/
 * update that segment:
 *
 *   zone_enter        → arrived at a known zone: close any open, open a stop
 *   zone_leave        → left a zone: close the open stop, open a drive
 *   activity_change   → in_vehicle: ensure a drive is open
 *                       still:      close an open drive, open a stop (here)
 *   location_update   → fill in a stop's address/coords once they arrive
 *
 * Walking/running/cycling/unknown are treated as non-transitions in v1.
 */

import {
  suggestActivityForSegment,
  type ActivityType,
  type DetectedActivity,
  type LocationEventKind,
  type SegmentKind,
} from "@ai-fsm/domain";

/** The currently-open segment, as the reducer needs to see it. */
export interface OpenSegment {
  id: string;
  kind: SegmentKind;
  startedAt: string;
  zone: string | null;
  placeLabel: string | null;
  latitude: number | null;
  longitude: number | null;
}

/** A normalized incoming event (already validated by the route). */
export interface IncomingLocationEvent {
  kind: LocationEventKind;
  occurredAt: string;
  zone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  geocodedAddress?: string | null;
  detectedActivity?: DetectedActivity | null;
}

/** Fields for opening a new segment. */
export interface OpenSegmentSpec {
  kind: SegmentKind;
  startedAt: string;
  zone: string | null;
  placeLabel: string | null;
  latitude: number | null;
  longitude: number | null;
  suggestedActivityType: ActivityType | null;
}

/** Patch applied to the currently-open segment. */
export interface UpdateOpenSpec {
  placeLabel?: string | null;
  zone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * What the route should do. `closeOpen` must be applied BEFORE `open` so the
 * "one open segment per account" invariant never sees two open rows.
 */
export interface SegmentMutations {
  closeOpen?: { endedAt: string };
  open?: OpenSegmentSpec;
  updateOpen?: UpdateOpenSpec;
}

const NO_OP: SegmentMutations = {};

function openStop(ev: IncomingLocationEvent, placeLabel: string | null): OpenSegmentSpec {
  const zone = ev.zone ?? null;
  return {
    kind: "stop",
    startedAt: ev.occurredAt,
    zone,
    placeLabel,
    latitude: ev.latitude ?? null,
    longitude: ev.longitude ?? null,
    suggestedActivityType: suggestActivityForSegment({ kind: "stop", zone }),
  };
}

function openDrive(ev: IncomingLocationEvent): OpenSegmentSpec {
  return {
    kind: "drive",
    startedAt: ev.occurredAt,
    zone: null,
    placeLabel: null,
    latitude: ev.latitude ?? null,
    longitude: ev.longitude ?? null,
    suggestedActivityType: suggestActivityForSegment({ kind: "drive" }),
  };
}

export function reduceLocationEvent(
  open: OpenSegment | null,
  ev: IncomingLocationEvent,
): SegmentMutations {
  switch (ev.kind) {
    case "zone_enter": {
      // Already parked in this exact zone → nothing changes.
      if (open?.kind === "stop" && open.zone && ev.zone && open.zone === ev.zone) {
        return NO_OP;
      }
      const label = ev.zone ?? ev.geocodedAddress ?? null;
      return {
        ...(open ? { closeOpen: { endedAt: ev.occurredAt } } : {}),
        open: openStop(ev, label),
      };
    }

    case "zone_leave": {
      // Left a place → start driving. If already driving, ignore.
      if (open?.kind === "drive") return NO_OP;
      return {
        ...(open ? { closeOpen: { endedAt: ev.occurredAt } } : {}),
        open: openDrive(ev),
      };
    }

    case "activity_change": {
      const act = ev.detectedActivity ?? null;
      if (act === "in_vehicle") {
        if (open?.kind === "drive") return NO_OP; // already driving
        return {
          ...(open ? { closeOpen: { endedAt: ev.occurredAt } } : {}),
          open: openDrive(ev),
        };
      }
      if (act === "still") {
        // Stopped moving → a stop here (address fills in via location_update).
        if (open?.kind === "stop") return NO_OP; // already stopped
        const label = ev.zone ?? ev.geocodedAddress ?? null;
        return {
          ...(open ? { closeOpen: { endedAt: ev.occurredAt } } : {}),
          open: openStop(ev, label),
        };
      }
      // walking / running / cycling / unknown → no transition in v1.
      return NO_OP;
    }

    case "location_update": {
      // Enrich an open stop that is still missing a label/coords.
      if (!open || open.kind !== "stop") return NO_OP;
      const patch: UpdateOpenSpec = {};
      if (!open.placeLabel && (ev.zone || ev.geocodedAddress)) {
        patch.placeLabel = ev.zone ?? ev.geocodedAddress ?? null;
      }
      if (!open.zone && ev.zone) patch.zone = ev.zone;
      if (open.latitude == null && ev.latitude != null) patch.latitude = ev.latitude;
      if (open.longitude == null && ev.longitude != null) patch.longitude = ev.longitude;
      return Object.keys(patch).length > 0 ? { updateOpen: patch } : NO_OP;
    }

    default:
      return NO_OP;
  }
}
