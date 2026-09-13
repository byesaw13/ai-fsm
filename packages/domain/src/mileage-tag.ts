/** How to attach miles after a visit closeout. */
export type MileageTagStrategy = "claim_day" | "gps_hops" | "none";

export function mileageTagStrategy(opts: {
  otherCompletedVisitsThatDay: number;
  hasUntaggedClaim: boolean;
  hasUntaggedGpsHops: boolean;
}): MileageTagStrategy {
  if (opts.otherCompletedVisitsThatDay <= 0 && opts.hasUntaggedClaim) return "claim_day";
  if (opts.otherCompletedVisitsThatDay > 0 && opts.hasUntaggedGpsHops) return "gps_hops";
  if (opts.hasUntaggedClaim) return "claim_day";
  return "none";
}
