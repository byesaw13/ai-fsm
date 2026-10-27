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
