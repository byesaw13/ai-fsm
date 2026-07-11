/**
 * Distance / drive-time lookup for travel charging.
 *
 * Strategy:
 *  1. If origin + destination lat/lng known → OSRM public routing (road mi + duration)
 *  2. Else geocode missing addresses via Nominatim, then OSRM
 *  3. Fallback: haversine × road factor + estimated minutes
 *  4. Always allow caller to override with manual miles/minutes
 */

import {
  estimateDriveMinutesFromMiles,
  haversineMeters,
  metersToMiles,
  roundMiles,
  type LatLng,
} from "@ai-fsm/domain";

export interface DistanceLookupResult {
  one_way_miles: number;
  one_way_minutes: number;
  origin: LatLng | null;
  destination: LatLng | null;
  origin_address: string;
  destination_address: string;
  source: "map_provider" | "haversine_estimate" | "manual";
  geocode_failed: boolean;
  error?: string;
}

const OSRM_BASE = "https://router.project-osrm.org";
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
/** Inflate great-circle distance to approximate road miles. */
const ROAD_FACTOR = 1.28;

export function buildFullAddress(parts: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): string {
  const line1 = (parts.address ?? "").trim();
  const cityState = [parts.city, parts.state].filter(Boolean).join(", ");
  const zip = (parts.zip ?? "").trim();
  return [line1, cityState, zip].filter(Boolean).join(", ");
}

export async function geocodeAddress(
  address: string,
  opts?: { timeoutMs?: number }
): Promise<LatLng | null> {
  const q = address.trim();
  if (!q) return null;
  const timeoutMs = opts?.timeoutMs ?? 8000;
  const url = `${NOMINATIM_BASE}/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "DovetailsFSM/1.0 (travel-charging; contact=ops@dovetails)",
      },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!data?.length) return null;
    return {
      latitude: parseFloat(data[0].lat),
      longitude: parseFloat(data[0].lon),
    };
  } catch {
    return null;
  }
}

export async function osrmRoute(
  origin: LatLng,
  destination: LatLng,
  opts?: { timeoutMs?: number }
): Promise<{ miles: number; minutes: number } | null> {
  const timeoutMs = opts?.timeoutMs ?? 8000;
  // OSRM expects lon,lat
  const coords = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
  const url = `${OSRM_BASE}/route/v1/driving/${coords}?overview=false`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      code?: string;
      routes?: Array<{ distance: number; duration: number }>;
    };
    if (data.code !== "Ok" || !data.routes?.[0]) return null;
    const route = data.routes[0];
    return {
      miles: roundMiles(metersToMiles(route.distance)),
      minutes: Math.max(1, Math.round(route.duration / 60)),
    };
  } catch {
    return null;
  }
}

export function haversineEstimate(
  origin: LatLng,
  destination: LatLng
): { miles: number; minutes: number } {
  const meters = haversineMeters(origin, destination);
  const roadMiles = roundMiles(metersToMiles(meters) * ROAD_FACTOR);
  return {
    miles: roadMiles,
    minutes: estimateDriveMinutesFromMiles(roadMiles),
  };
}

export async function lookupOneWayDistance(input: {
  origin_address: string;
  destination_address: string;
  origin_coords?: LatLng | null;
  destination_coords?: LatLng | null;
  /** Manual override — skips network lookup. */
  manual_one_way_miles?: number | null;
  manual_one_way_minutes?: number | null;
}): Promise<DistanceLookupResult> {
  const originAddress = input.origin_address.trim();
  const destAddress = input.destination_address.trim();

  if (
    input.manual_one_way_miles != null &&
    Number.isFinite(input.manual_one_way_miles)
  ) {
    const miles = roundMiles(Math.max(0, input.manual_one_way_miles));
    const minutes =
      input.manual_one_way_minutes != null && Number.isFinite(input.manual_one_way_minutes)
        ? Math.max(0, Math.round(input.manual_one_way_minutes))
        : estimateDriveMinutesFromMiles(miles);
    return {
      one_way_miles: miles,
      one_way_minutes: minutes,
      origin: input.origin_coords ?? null,
      destination: input.destination_coords ?? null,
      origin_address: originAddress,
      destination_address: destAddress,
      source: "manual",
      geocode_failed: false,
    };
  }

  let origin = input.origin_coords ?? null;
  let destination = input.destination_coords ?? null;
  let geocodeFailed = false;

  if (!origin && originAddress) {
    origin = await geocodeAddress(originAddress);
    if (!origin) geocodeFailed = true;
  }
  if (!destination && destAddress) {
    destination = await geocodeAddress(destAddress);
    if (!destination) geocodeFailed = true;
  }

  if (origin && destination) {
    const route = await osrmRoute(origin, destination);
    if (route) {
      return {
        one_way_miles: route.miles,
        one_way_minutes: route.minutes,
        origin,
        destination,
        origin_address: originAddress,
        destination_address: destAddress,
        source: "map_provider",
        geocode_failed: false,
      };
    }
    const est = haversineEstimate(origin, destination);
    return {
      one_way_miles: est.miles,
      one_way_minutes: est.minutes,
      origin,
      destination,
      origin_address: originAddress,
      destination_address: destAddress,
      source: "haversine_estimate",
      geocode_failed: false,
      error: "Map routing unavailable — used straight-line estimate",
    };
  }

  return {
    one_way_miles: 0,
    one_way_minutes: 0,
    origin,
    destination,
    origin_address: originAddress,
    destination_address: destAddress,
    source: "manual",
    geocode_failed: geocodeFailed || !origin || !destination,
    error: "Could not geocode address — enter mileage and time manually",
  };
}
