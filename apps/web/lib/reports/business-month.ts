import { query } from "@/lib/db";

/** Dovetails operates in Eastern time when an account has no saved zone. */
export const DEFAULT_BUSINESS_TIME_ZONE = "America/New_York";

const TIME_ZONE_PATTERN = /^[A-Za-z0-9_+\-/]+$/;

export function sqlSafeTimeZone(timeZone: string | null | undefined): string {
  if (timeZone && TIME_ZONE_PATTERN.test(timeZone)) return timeZone;
  return DEFAULT_BUSINESS_TIME_ZONE;
}

/**
 * Business-local YYYY-MM for an instant.
 * 11:30 PM Eastern on the last day of a month stays in that month even when UTC
 * has already rolled forward.
 */
export function businessMonthKey(instant: Date, timeZone: string): string {
  const zone = sqlSafeTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(instant);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  if (!year || !month) return instant.toISOString().slice(0, 7);
  return `${year}-${month}`;
}

/**
 * SQL expression for a timestamptz column. Date-only columns such as
 * expense_date and session_date must not use this.
 */
export function timestampBusinessMonthExpr(column: string, timeZone: string): string {
  if (!/^[a-z_][a-z0-9_.]*$/i.test(column)) {
    throw new Error(`Refusing to interpolate column ${column}`);
  }
  return `to_char(${column} AT TIME ZONE '${sqlSafeTimeZone(timeZone)}', 'YYYY-MM')`;
}

export async function loadBusinessTimeZone(accountId: string): Promise<string> {
  const rows = await query<{ working_hours_tz: string | null }>(
    `SELECT working_hours_tz
     FROM automation_settings
     WHERE account_id = $1
     LIMIT 1`,
    [accountId],
  );
  return sqlSafeTimeZone(rows[0]?.working_hours_tz);
}
