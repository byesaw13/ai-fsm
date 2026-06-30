const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** Canonical cents → "$1,234.56" (sign-aware, grouped). null/undefined → "$0.00". */
export function formatCents(cents: number | string | null | undefined): string {
  return USD.format(Number(cents ?? 0) / 100);
}

export const formatCentsToDollars = formatCents;

/** Parse dollar string to cents. Returns 0 for invalid/negative. */
export function parseDollarsToCents(value: string): number {
  const parsed = parseFloat(value);
  if (isNaN(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}

/** Whole-dollar display — e.g. 162500 → "$1,625" */
export function formatCentsShort(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}