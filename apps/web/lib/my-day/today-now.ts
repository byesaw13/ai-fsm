/** What is Now on Today. Never clock + activity chips + hero together. */
export type TodayNowKind = "start_day" | "park" | "job" | "van";

/** Activity chips stay an engine. They are not a second Now. */
export function todayShowsActivityNow(): boolean {
  return false;
}

export function todayNowKind(input: {
  dayStarted: boolean;
  hasParkProposal: boolean;
  hasHero: boolean;
}): TodayNowKind {
  if (!input.dayStarted) return "start_day";
  if (input.hasParkProposal) return "park";
  if (input.hasHero) return "job";
  return "van";
}

/** FieldRightNowCard (NowBar + vehicle row) is the stacked second Now. */
export function todayShowsFieldRightNow(_kind: TodayNowKind): boolean {
  return false;
}
