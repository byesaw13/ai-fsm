/**
 * Geo helpers — TASK-025.
 *
 * GPS-derived trip distance for auto-mileage. Distances are estimates (great
 * circle between captured points); the owner confirms/edits the miles before
 * they reach the ledger.
 */

const EARTH_RADIUS_METERS = 6_371_000;
const METERS_PER_MILE = 1609.344;

export interface LatLng {
  latitude: number;
  longitude: number;
}

/** Great-circle (haversine) distance between two points, in meters. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Sum of leg distances along an ordered list of points, in meters. */
export function pathDistanceMeters(points: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineMeters(points[i - 1], points[i]);
  }
  return total;
}

export function metersToMiles(meters: number): number {
  return meters / METERS_PER_MILE;
}

/** Round to 0.1 mi — the granularity a mileage log needs. */
export function metersToMilesRounded(meters: number): number {
  return Math.round(metersToMiles(meters) * 10) / 10;
}
