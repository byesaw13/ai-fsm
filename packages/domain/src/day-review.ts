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
};

/** Compares GPS-estimated miles to odometer miles; flags if delta > 20%. */
export function checkMileageDelta(
  odometerMiles: number | null,
  gpsMiles: number,
): MileageDeltaResult {
  if (odometerMiles == null) return { deltaPercent: null, flagged: false };
  const deltaPercent = Math.round(Math.abs((gpsMiles - odometerMiles) / odometerMiles) * 100);
  return { deltaPercent, flagged: deltaPercent > 20 };
}
