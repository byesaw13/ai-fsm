/** How a mileage number was captured (OPERATIONS.md capture-method trust). */
export const MILES_SOURCES = [
  "odometer",
  "manual_miles",
  "gps_estimate",
  "bt_gps_estimate",
] as const;

export type MilesSource = (typeof MILES_SOURCES)[number];

export const VEHICLE_SESSION_STATUSES = ["open", "closed", "voided"] as const;
export type VehicleSessionStatus = (typeof VEHICLE_SESSION_STATUSES)[number];

export const MILES_SOURCE_LABELS: Record<MilesSource, string> = {
  odometer: "Odometer",
  manual_miles: "Manual",
  gps_estimate: "GPS estimate",
  bt_gps_estimate: "Bluetooth GPS",
};

export function isGpsEstimateSource(source: MilesSource | null | undefined): boolean {
  return source === "gps_estimate" || source === "bt_gps_estimate";
}

/** Owner-visible short label for capture method badges. */
export function milesSourceLabel(source: MilesSource | null | undefined): string | null {
  if (!source) return null;
  return MILES_SOURCE_LABELS[source] ?? source;
}