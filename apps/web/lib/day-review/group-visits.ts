import type { DayReviewPayload } from "./queries";

type Visit = DayReviewPayload["visits"][number];

export type VisitGroup = {
  /** Stable key for React + selection. */
  key: string;
  clientName: string;
  propertyName: string;
  /** Every candidate id in this property/day group. */
  ids: string[];
  visitCount: number;
  totalMinutes: number;
  maxConfidence: number;
  preSelected: boolean;
  /** Classification to use for a one-tap "confirm all in group". */
  preSelectedClassification: string;
};

/**
 * TASK-079: collapse a day's visit candidates into one row per property. A field
 * day at one job can produce many candidates (real re-visits + residual jitter);
 * grouping makes Day Review one decision per property instead of dozens of
 * identical cards. Confirming still acts on every id in the group (one honest
 * ledger entry per real session) — this only consolidates the *review*.
 */
export function groupVisitsByProperty(visits: Visit[]): VisitGroup[] {
  const groups = new Map<string, VisitGroup>();
  for (const v of visits) {
    const key = v.propertyId ?? `${v.clientName}•${v.propertyName}`;
    const g = groups.get(key);
    if (g) {
      g.ids.push(v.id);
      g.visitCount += 1;
      g.totalMinutes += v.durationMinutes;
      g.maxConfidence = Math.max(g.maxConfidence, v.confidenceScore);
      g.preSelected = g.preSelected || v.preSelected;
      if (v.preSelected && v.classification) g.preSelectedClassification = v.classification;
    } else {
      groups.set(key, {
        key,
        clientName: v.clientName,
        propertyName: v.propertyName,
        ids: [v.id],
        visitCount: 1,
        totalMinutes: v.durationMinutes,
        maxConfidence: v.confidenceScore,
        preSelected: v.preSelected,
        preSelectedClassification: v.classification ?? "job_work",
      });
    }
  }
  return [...groups.values()];
}
