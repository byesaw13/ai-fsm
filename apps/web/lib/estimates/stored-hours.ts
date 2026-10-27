/**
 * Person-hours stored on an estimate (TASK-191).
 * A blank value stays null. Missing hours are never written as zero.
 */

export const HOUR_SOURCES = [
  "owner",
  "price_book",
  "production_rate",
  "ai_allowance",
  "revision",
  "travel_calc",
] as const;

export type HourSource = (typeof HOUR_SOURCES)[number];

export function storedHour(value: number | null | undefined): number | null {
  if (value == null) return null;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("Hours must be zero or more");
  }
  return value;
}

export function storedHourRange(
  low: number | null | undefined,
  high: number | null | undefined,
): { low: number | null; high: number | null } {
  const storedLow = storedHour(low);
  const storedHigh = storedHour(high);
  if (storedLow != null && storedHigh != null && storedLow > storedHigh) {
    throw new Error("Hours low cannot be above high");
  }
  return { low: storedLow, high: storedHigh };
}

export function storedHourSource(value: string | null | undefined): HourSource | null {
  if (value == null || value === "") return null;
  if (!(HOUR_SOURCES as readonly string[]).includes(value)) {
    throw new Error("Hours source is not recognized");
  }
  return value as HourSource;
}

/** Columns for one line. A source without hours is not stored. */
export function lineHourColumns(item: {
  hours_low?: number | null;
  hours_high?: number | null;
  hours_source?: string | null;
}): { hours_low: number | null; hours_high: number | null; hours_source: HourSource | null } {
  const range = storedHourRange(item.hours_low, item.hours_high);
  const source = storedHourSource(item.hours_source);
  return {
    hours_low: range.low,
    hours_high: range.high,
    hours_source: range.low == null && range.high == null ? null : source,
  };
}

/** Least certain first. A group's source is the least certain of its tasks. */
const LEAST_CERTAIN_FIRST: readonly HourSource[] = [
  "ai_allowance",
  "production_rate",
  "revision",
  "price_book",
  "owner",
  "travel_calc",
];

export function leastCertainHourSource(
  sources: Iterable<string | null | undefined>,
): HourSource | null {
  let best: HourSource | null = null;
  let bestRank = Infinity;
  for (const source of sources) {
    if (!source) continue;
    const rank = LEAST_CERTAIN_FIRST.indexOf(source as HourSource);
    if (rank < 0 || rank >= bestRank) continue;
    best = source as HourSource;
    bestRank = rank;
  }
  return best;
}

/** Price-book hours. Typical hours fill a missing side. No hours stays null.
 * Postgres NUMERIC arrives as a string. Number.isFinite rejects that string. */
export function priceBookHourRange(row: {
  labor_hours_low?: number | string | null;
  labor_hours_high?: number | string | null;
  labor_hours_typical?: number | string | null;
  default_labor_hours?: number | string | null;
}): { hours_low: number; hours_high: number; hours_source: "price_book" } | null {
  const side = (value: number | string | null | undefined): number | null => {
    if (value == null || value === "") return null;
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
  };
  const typical = side(row.labor_hours_typical) ?? side(row.default_labor_hours);
  let low = side(row.labor_hours_low) ?? typical;
  let high = side(row.labor_hours_high) ?? typical;
  if (low == null && high == null) return null;
  if (low == null) low = high;
  if (high == null) high = low;
  if (low! > high!) {
    const swap = low;
    low = high;
    high = swap;
  }
  return { hours_low: low!, hours_high: high!, hours_source: "price_book" };
}

/** A blank field is null. An explicit 0 is kept.
 * Invalid text, including a negative, is null. This runs while the form renders. */
export function parseHourInput(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  const n = typeof raw === "number" ? raw : Number(raw.trim());
  if (typeof raw === "string" && raw.trim() === "") return null;
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function formatHourInput(value: number | string | null | undefined): string {
  if (value == null || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return String(n);
}

/** A range is missing until both sides are filled. */
export function hoursAreMissing(
  low: string | number | null | undefined,
  high: string | number | null | undefined,
): boolean {
  return parseHourInput(low) == null || parseHourInput(high) == null;
}

/** Form text → stored columns. Blank stays null, never zero. */
export function formHourColumns(row: {
  hours_low?: string | number | null;
  hours_high?: string | number | null;
  hours_source?: string | null;
}): { hours_low: number | null; hours_high: number | null; hours_source: HourSource | null } {
  return lineHourColumns({
    hours_low: parseHourInput(row.hours_low),
    hours_high: parseHourInput(row.hours_high),
    hours_source: row.hours_source,
  });
}

/** Editing either side makes the source the owner's. Clearing both clears the source. */
export function withHourEdit<T extends {
  hours_low?: string;
  hours_high?: string;
  hours_source?: string | null;
}>(row: T, field: keyof T, value: string): T {
  if (field !== "hours_low" && field !== "hours_high") {
    return { ...row, [field]: value };
  }
  const next = { ...row, [field]: value };
  const low = String(field === "hours_low" ? value : next.hours_low ?? "");
  const high = String(field === "hours_high" ? value : next.hours_high ?? "");
  next.hours_source = low.trim() === "" && high.trim() === "" ? null : "owner";
  return next;
}

/** Billable travel minutes → a 1:1 person-hour range. Mileage is not hours. */
export function travelTimeHours(minutes: number): {
  hours_low: number;
  hours_high: number;
  hours_source: "travel_calc";
} | null {
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  const hours = minutes / 60;
  return { hours_low: hours, hours_high: hours, hours_source: "travel_calc" };
}

export const PERSON_HOURS_LABEL = "Person-hours";
export const PERSON_HOURS_HINT = "2 painters x 8 h = 16 h";
export const HOURS_MISSING_LABEL = "Hours missing";
export const OPTION_BASELINE_NOTE = "Baseline not available for option quotes yet";

export function quickEstimateCanSend(input: {
  hoursLow: string;
  hoursHigh: string;
  directCostsConfirmed: boolean;
  priceCents: number;
}): { ok: boolean; hoursMissing: boolean } {
  const hoursMissing = hoursAreMissing(input.hoursLow, input.hoursHigh);
  return {
    hoursMissing,
    ok: !hoursMissing && input.directCostsConfirmed && input.priceCents > 0,
  };
}
