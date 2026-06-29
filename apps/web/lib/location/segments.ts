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
  vehicleId: string | null;
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
  // TASK-025: the vehicle resolved from a vehicle_connect's Bluetooth id (the
  // route resolves the id → vehicle before calling the reducer).
  vehicleId?: string | null;
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
  vehicleId: string | null;
}

/** Patch applied to the currently-open segment. */
export interface UpdateOpenSpec {
  placeLabel?: string | null;
  zone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  vehicleId?: string | null;
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

type KnownPlaceRule = {
  label: string;
  match: RegExp;
};

const KNOWN_PLACE_RULES: KnownPlaceRule[] = [
  { label: "Transfer station", match: /\b(transfer\s+station|dump|recycling\s+center|landfill)\b/i },
  { label: "Home Depot", match: /\bhome\s+depot\b/i },
  { label: "Lowe's", match: /\blowe'?s\b/i },
  { label: "Ace Hardware", match: /\bace\s+hardware\b/i },
  { label: "Ferguson", match: /\bferguson\b/i },
  { label: "Hardware store", match: /\bhardware\b/i },
  { label: "Supply house", match: /\b(supply|warehouse|grainger|menards)\b/i },
  { label: "Gas stop", match: /\b(gas|fuel|shell|mobil|sunoco|citgo|cumberland\s+farms)\b/i },
  { label: "Home", match: /^home$/i },
];

function knownPlaceLabel(input: string | null | undefined): string | null {
  if (!input) return null;
  for (const rule of KNOWN_PLACE_RULES) {
    if (rule.match.test(input)) return rule.label;
  }
  return null;
}

function stopLabel(ev: IncomingLocationEvent): string | null {
  const raw = ev.zone ?? ev.geocodedAddress ?? null;
  return knownPlaceLabel(raw) ?? raw;
}

function shouldRefreshStopLabel(open: OpenSegment, nextLabel: string | null): boolean {
  if (!nextLabel) return false;
  if (!open.placeLabel) return true;
  if (open.zone) return false;
  return open.placeLabel !== nextLabel;
}

function openStop(ev: IncomingLocationEvent, placeLabel: string | null): OpenSegmentSpec {
  const zone = ev.zone ?? null;
  const label = knownPlaceLabel(placeLabel) ?? placeLabel;
  return {
    kind: "stop",
    startedAt: ev.occurredAt,
    zone,
    placeLabel: label,
    latitude: ev.latitude ?? null,
    longitude: ev.longitude ?? null,
    suggestedActivityType: suggestActivityForSegment({ kind: "stop", zone: zone ?? label }),
    vehicleId: null,
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
    vehicleId: ev.vehicleId ?? null,
  };
}

function hasStopLocation(ev: IncomingLocationEvent): boolean {
  return Boolean(
    ev.zone ||
      ev.geocodedAddress ||
      (ev.latitude != null && ev.longitude != null),
  );
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
      return {
        ...(open ? { closeOpen: { endedAt: ev.occurredAt } } : {}),
        open: openStop(ev, stopLabel(ev)),
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

    case "vehicle_connect": {
      // Ignition on in a known vehicle — the strongest "driving" signal, and it
      // tells us which vehicle. If already driving, just tag/retag the vehicle.
      if (open?.kind === "drive") {
        return open.vehicleId === (ev.vehicleId ?? null)
          ? NO_OP
          : { updateOpen: { vehicleId: ev.vehicleId ?? null } };
      }
      return {
        ...(open ? { closeOpen: { endedAt: ev.occurredAt } } : {}),
        open: openDrive(ev),
      };
    }

    case "vehicle_disconnect": {
      // Ignition off — end the drive. If the event includes a usable location,
      // open the stop immediately; otherwise the next location_update will.
      if (open?.kind === "drive") {
        return {
          closeOpen: { endedAt: ev.occurredAt },
          ...(hasStopLocation(ev) ? { open: openStop(ev, stopLabel(ev)) } : {}),
        };
      }
      return NO_OP;
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
        return {
          ...(open ? { closeOpen: { endedAt: ev.occurredAt } } : {}),
          open: openStop(ev, stopLabel(ev)),
        };
      }
      // walking / running / cycling / unknown → no transition in v1.
      return NO_OP;
    }

    case "location_update": {
      // Enrich an open stop that is still missing a label/coords. If a drive was
      // just closed by vehicle_disconnect, this may be the first arrival signal,
      // so open a stop instead of dropping the update on the floor.
      if (!open) {
        return hasStopLocation(ev)
          ? { open: openStop(ev, stopLabel(ev)) }
          : NO_OP;
      }
      if (open.kind !== "stop") return NO_OP;
      const patch: UpdateOpenSpec = {};
      const nextLabel = stopLabel(ev);
      if (shouldRefreshStopLabel(open, nextLabel)) {
        patch.placeLabel = nextLabel;
      }
      if (!open.zone && ev.zone) patch.zone = ev.zone;
      if ((open.latitude == null || !open.zone) && ev.latitude != null) patch.latitude = ev.latitude;
      if ((open.longitude == null || !open.zone) && ev.longitude != null) patch.longitude = ev.longitude;
      return Object.keys(patch).length > 0 ? { updateOpen: patch } : NO_OP;
    }

    default:
      return NO_OP;
  }
}
