import {
  haversineMeters,
  isOutsideStopFence,
  rankVisitCandidates,
  relocationRadiusMeters,
  type VisitMatchCandidate,
} from "@ai-fsm/domain";

/** Hard cap — auto-detect never fires beyond ~250 ft even if geofence is wider. */
export const MAX_AUTO_DETECT_METERS = 250 * 0.3048;

export interface StopCoords {
  latitude: number;
  longitude: number;
}

export interface PropertyGeo {
  propertyId: string;
  clientId: string;
  clientName: string;
  address: string;
  latitude: number;
  longitude: number;
  geofenceRadiusFeet?: number;
  scheduledToday?: boolean;
  jobId?: string | null;
  visitId?: string | null;
}

export interface ConfirmedStopMatch {
  propertyId: string;
  clientId: string;
  clientName: string;
  propertyAddress: string;
  jobId: string | null;
  visitId: string | null;
  distanceMeters: number;
  confidence: number;
  reason: string;
}

export function geofenceMeters(radiusFeet: number | null | undefined): number {
  const feet = radiusFeet ?? 150;
  return Math.min(feet * 0.3048, MAX_AUTO_DETECT_METERS);
}

/** True only when the stop pin is inside the property geofence (≤250 ft cap). */
export function isStopNearProperty(
  stop: StopCoords,
  property: Pick<PropertyGeo, "latitude" | "longitude" | "geofenceRadiusFeet">,
): boolean {
  const dist = haversineMeters(
    { latitude: stop.latitude, longitude: stop.longitude },
    { latitude: property.latitude, longitude: property.longitude },
  );
  return dist <= geofenceMeters(property.geofenceRadiusFeet);
}

/**
 * Pick the best customer match for an open GPS stop. Auto-detect requires
 * provable proximity — schedule hints alone are not enough.
 */
export function matchCustomerAtStop(
  stop: StopCoords,
  durationMinutes: number,
  properties: PropertyGeo[],
): ConfirmedStopMatch | null {
  if (properties.length === 0) return null;

  const candidates: VisitMatchCandidate[] = properties.map((p) => ({
    propertyId: p.propertyId,
    clientId: p.clientId,
    latitude: p.latitude,
    longitude: p.longitude,
    scheduledToday: p.scheduledToday,
    openJob: !!p.jobId,
    jobId: p.jobId,
    visitId: p.visitId,
  }));

  const ranked = rankVisitCandidates({
    stop: { latitude: stop.latitude, longitude: stop.longitude, durationMinutes },
    candidates,
  });

  for (const match of ranked) {
    if (match.distanceMeters == null) continue;

    const prop = properties.find((p) => p.propertyId === match.propertyId);
    if (!prop) continue;

    const limit = geofenceMeters(prop.geofenceRadiusFeet);
    if (match.distanceMeters > limit) continue;

    const hasDistanceProof =
      match.reasons.includes("within_150ft") || match.reasons.includes("within_250ft");
    if (!hasDistanceProof) continue;

    return {
      propertyId: prop.propertyId,
      clientId: prop.clientId,
      clientName: prop.clientName,
      propertyAddress: prop.address,
      jobId: match.jobId,
      visitId: match.visitId,
      distanceMeters: Math.round(match.distanceMeters),
      confidence: match.score,
      reason: `GPS stop within ${Math.round(match.distanceMeters)}m of property`,
    };
  }

  return null;
}

/** Fence used by the ingest reducer: matched property geofence, else unmatched default. */
export function relocationRadiusForStop(
  stop: { latitude: number | null; longitude: number | null },
  properties: PropertyGeo[],
): number {
  if (stop.latitude == null || stop.longitude == null || properties.length === 0) {
    return relocationRadiusMeters(null);
  }
  const match = matchCustomerAtStop(
    { latitude: stop.latitude, longitude: stop.longitude },
    10,
    properties,
  );
  if (!match) return relocationRadiusMeters(null);
  const prop = properties.find((p) => p.propertyId === match.propertyId);
  return relocationRadiusMeters(prop?.geofenceRadiusFeet);
}

/**
 * TASK-150: a `still` ping outside the current fence only means "left this
 * job" when it matches a *different* known property. Unmatched neighbor
 * geocodes (8 Bus Rd, 69 N Policy next to 4 Ash) hold.
 */
export function isDifferentPropertyStill(
  openStop: StopCoords,
  ping: StopCoords,
  properties: PropertyGeo[],
  relocationRadiusM: number,
): boolean {
  if (
    !isOutsideStopFence({
      from: openStop,
      to: ping,
      radiusMeters: relocationRadiusM,
    })
  ) {
    return false;
  }
  const there = matchCustomerAtStop(ping, 10, properties);
  if (!there) return false;
  const here = matchCustomerAtStop(openStop, 10, properties);
  if (!here) return true;
  return here.propertyId !== there.propertyId;
}