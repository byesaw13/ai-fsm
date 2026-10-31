/** Unit words for production_rates.rate_unit (TASK-193). */
const UNITS: Record<string, { thing: string; per: "day" | "hour" }> = {
  sqft_per_day: { thing: "sq ft", per: "day" },
  sqft_per_hour: { thing: "sq ft", per: "hour" },
  linear_ft_per_day: { thing: "linear ft", per: "day" },
  units_per_day: { thing: "units", per: "day" },
};

function round(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/** "400 sq ft a day = 50 sq ft an hour at 8 h a day", so the conversion is always visible. */
export function rateConversionLabel(rate: { base_rate: number; rate_unit: string }, hoursPerDay: number): string {
  const u = UNITS[rate.rate_unit] ?? { thing: rate.rate_unit, per: "day" as const };
  if (u.per === "hour") return `${round(rate.base_rate)} ${u.thing} an hour`;
  return `${round(rate.base_rate)} ${u.thing} a day = ${round(rate.base_rate / hoursPerDay)} ${u.thing} an hour at ${round(hoursPerDay)} h a day`;
}

/** "-15% (slower)" for a throughput modifier stored as -0.15. */
export function modifierLabel(pct: number): string {
  const n = Math.round(pct * 1000) / 10;
  if (n === 0) return "0%";
  return `${n > 0 ? "+" : ""}${n}% (${n < 0 ? "slower" : "faster"})`;
}
