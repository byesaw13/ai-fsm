/**
 * Single business timezone for every user-facing clock and calendar label.
 *
 * Server components run in a UTC container; client components use the browser
 * zone. Without an explicit timeZone, the same instant shows 4–5 hours apart.
 * America/New_York follows EST/EDT. Client-safe — no Node/pg imports.
 */
export const BUSINESS_TIMEZONE = "America/New_York";

const TIME_OPTS: Intl.DateTimeFormatOptions = {
  hour: "numeric",
  minute: "2-digit",
  timeZone: BUSINESS_TIMEZONE,
};

const DATE_OPTS: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: BUSINESS_TIMEZONE,
};

export function formatBusinessTime(iso: string | number | Date): string {
  return new Date(iso).toLocaleTimeString("en-US", TIME_OPTS);
}

export function formatBusinessDate(
  iso: string | number | Date,
  extra: Intl.DateTimeFormatOptions = {},
): string {
  return new Date(iso).toLocaleDateString("en-US", { ...DATE_OPTS, ...extra, timeZone: BUSINESS_TIMEZONE });
}

export function formatBusinessDateTime(iso: string | number | Date): string {
  return `${formatBusinessDate(iso)} ${formatBusinessTime(iso)}`;
}

/** YYYY-MM-DD in Eastern (for day-boundary comparisons). */
export function formatBusinessYmd(iso: string | number | Date): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: BUSINESS_TIMEZONE });
}

export function isSameBusinessDay(
  iso: string | number | Date,
  ref: string | number | Date = new Date(),
): boolean {
  return formatBusinessYmd(iso) === formatBusinessYmd(ref);
}
