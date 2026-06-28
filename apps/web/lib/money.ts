// Canonical USD money formatting. cents → "$1,234.56" (sign-aware, grouped).
// One shared Intl formatter; was reimplemented in ~5 places before.
const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatCents(cents: number | string): string {
  return USD.format(Number(cents) / 100);
}
