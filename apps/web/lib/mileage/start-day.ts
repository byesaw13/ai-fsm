// Smart Start Day (TASK-022): pick the vehicle the owner is most likely to
// start the day in, so the common case is one tap instead of a vehicle pick +
// odometer entry. Pure — no I/O — so the policy is unit-tested and the panel
// stays a renderer.

export interface StartDayVehicle {
  id: string;
  nickname: string;
  plate: string | null;
  current_odometer: number | null;
  /** ISO timestamp of this vehicle's most recent session start, or null. */
  last_used_at?: string | null;
}

/**
 * The vehicle to default Start Day to: the most recently used one. Falls back
 * to the first vehicle when nothing has been used yet (preserving the existing
 * alphabetical default). Returns null only when there are no vehicles.
 */
export function pickStartVehicle<T extends StartDayVehicle>(vehicles: T[]): T | null {
  if (vehicles.length === 0) return null;

  let best: T | null = null;
  let bestTime = -Infinity;
  for (const v of vehicles) {
    const t = v.last_used_at ? new Date(v.last_used_at).getTime() : NaN;
    if (!Number.isNaN(t) && t > bestTime) {
      bestTime = t;
      best = v;
    }
  }
  return best ?? vehicles[0];
}

/**
 * Whether a one-tap Start Day is offerable for this vehicle: we need a known
 * last odometer to prefill, otherwise the owner must enter it (fall back to the
 * full form).
 */
export function canSmartStart(vehicle: StartDayVehicle | null): vehicle is StartDayVehicle & { current_odometer: number } {
  return !!vehicle && typeof vehicle.current_odometer === "number";
}
