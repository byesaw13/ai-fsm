export type DayGap = {
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
};

type Span = { startedAt: string; endedAt: string };

/**
 * Returns coverage gaps between segments not filled by an activity entry
 * and exceeding minDwellMinutes.
 */
export function detectGaps(
  segments: Span[],
  entries: Span[],
  minDwellMinutes: number,
): DayGap[] {
  if (segments.length < 2) return [];
  const sorted = [...segments].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  );
  const gaps: DayGap[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const gapStart = sorted[i].endedAt;
    const gapEnd = sorted[i + 1].startedAt;
    const durationMinutes = (new Date(gapEnd).getTime() - new Date(gapStart).getTime()) / 60000;
    if (durationMinutes < minDwellMinutes) continue;
    const covered = entries.some(
      (e) =>
        new Date(e.startedAt).getTime() <= new Date(gapStart).getTime() &&
        new Date(e.endedAt).getTime() >= new Date(gapEnd).getTime(),
    );
    if (!covered) gaps.push({ startsAt: gapStart, endsAt: gapEnd, durationMinutes });
  }
  return gaps;
}

export type ScoredCandidate = { id: string; confidenceScore: number; [key: string]: unknown };

/** Returns candidates at or above the confidence threshold. */
export function preSelectCandidates<T extends ScoredCandidate>(
  candidates: T[],
  threshold: number,
): T[] {
  return candidates.filter((c) => c.confidenceScore >= threshold);
}

export type MileageDeltaResult = {
  deltaPercent: number | null;
  flagged: boolean;
  /**
   * "diverged" — GPS and odometer both have data and disagree (worth a look).
   * "no_gps_coverage" — GPS captured too little to cross-check; the odometer
   * stands, and this is informational, not an alarm.
   * "ok" — they agree. null — no odometer to compare.
   */
  reason: "diverged" | "no_gps_coverage" | "ok" | null;
};

/**
 * TASK-080: below this many GPS miles, GPS is treated as "didn't capture the
 * trip" — not a disagreement with the odometer. Sparse drive points (short local
 * hops with no GPS trail) produce ~0 GPS miles, which must not read as "100% off".
 */
export const GPS_MIN_COVERAGE_MILES = 1;

/**
 * Compare GPS-estimated miles to odometer miles. Flags a real divergence (>20%),
 * but treats "GPS captured essentially nothing" as no-coverage, not a mismatch —
 * the odometer is the source of truth (hybrid tracking, TASK-027).
 */
export function checkMileageDelta(
  odometerMiles: number | null,
  gpsMiles: number,
): MileageDeltaResult {
  if (odometerMiles == null) return { deltaPercent: null, flagged: false, reason: null };
  if (odometerMiles >= GPS_MIN_COVERAGE_MILES && gpsMiles < GPS_MIN_COVERAGE_MILES) {
    return { deltaPercent: null, flagged: false, reason: "no_gps_coverage" };
  }
  const deltaPercent = Math.round(Math.abs((gpsMiles - odometerMiles) / odometerMiles) * 100);
  const flagged = deltaPercent > 20;
  return { deltaPercent, flagged, reason: flagged ? "diverged" : "ok" };
}
