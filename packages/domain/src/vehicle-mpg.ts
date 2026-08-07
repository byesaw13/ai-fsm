/**
 * MPG from fuel logs (TASK-093). Full-tank deltas accumulate partial fills
 * between full tanks. Suspect odometer rows are excluded.
 */
export type FuelLogForMpg = {
  filledAt: string;
  odometer: number | null;
  gallons: number;
  isFullTank: boolean;
  odometerSuspect: boolean;
};

export type MpgSegment = {
  startOdometer: number;
  endOdometer: number;
  miles: number;
  gallons: number;
  mpg: number;
};

/**
 * Chronological fuel fills → MPG segments between consecutive full tanks.
 * Partial fills between full tanks contribute gallons but not endpoints.
 */
export function computeMpgSegments(logs: FuelLogForMpg[]): MpgSegment[] {
  const usable = logs
    .filter((l) => !l.odometerSuspect && l.odometer != null && l.gallons > 0)
    .slice()
    .sort((a, b) => a.filledAt.localeCompare(b.filledAt));

  const segments: MpgSegment[] = [];
  let lastFullOdo: number | null = null;
  let gallonsAccum = 0;

  for (const log of usable) {
    const odo = log.odometer as number;
    if (log.isFullTank) {
      if (lastFullOdo != null && odo > lastFullOdo) {
        const miles = odo - lastFullOdo;
        const gallons = gallonsAccum + log.gallons;
        if (gallons > 0) {
          segments.push({
            startOdometer: lastFullOdo,
            endOdometer: odo,
            miles,
            gallons,
            mpg: Math.round((miles / gallons) * 10) / 10,
          });
        }
      }
      lastFullOdo = odo;
      gallonsAccum = 0;
    } else {
      // Partial between full tanks
      if (lastFullOdo != null) gallonsAccum += log.gallons;
    }
  }
  return segments;
}

/** Latest rolling MPG (last segment), or null. */
export function latestMpg(logs: FuelLogForMpg[]): number | null {
  const segs = computeMpgSegments(logs);
  if (segs.length === 0) return null;
  return segs[segs.length - 1].mpg;
}
