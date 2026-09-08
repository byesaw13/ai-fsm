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

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function partsInZone(instant: Date, tz: string = BUSINESS_TIMEZONE) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const map: Record<string, string> = {};
  for (const part of dtf.formatToParts(instant)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour) % 24,
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

/** Interpret YYYY-MM-DD + HH:MM as Eastern wall clock → UTC Date. */
export function easternWallToUtc(
  ymd: string,
  hhmm: string,
  tz: string = BUSINESS_TIMEZONE,
): Date {
  const [year, month, day] = ymd.split("-").map(Number);
  const [hour, minute] = hhmm.split(":").map(Number);
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const shown = partsInZone(new Date(asUtc), tz);
  const shownAsUtc = Date.UTC(
    shown.year,
    shown.month - 1,
    shown.day,
    shown.hour,
    shown.minute,
    shown.second,
  );
  return new Date(asUtc - (shownAsUtc - asUtc));
}

export function utcToEasternClock(iso: string | number | Date): string {
  const p = partsInZone(new Date(iso));
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

export function utcToEasternDatetimeLocal(iso: string | number | Date): string {
  return `${formatBusinessYmd(iso)}T${utcToEasternClock(iso)}`;
}

/** Parse `<input type="datetime-local">` as Eastern, not the browser zone. */
export function easternDatetimeLocalToUtc(value: string): Date {
  const [ymd, hm] = value.split("T");
  const hhmm = (hm ?? "00:00").slice(0, 5);
  return easternWallToUtc(ymd, hhmm);
}
