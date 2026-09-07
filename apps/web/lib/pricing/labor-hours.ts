/**
 * Recover approximate labor hours from a stored internal labor COST.
 *
 * The painting engine stores `internal_labor_cost_cents` as
 * `approxHours × labor_cost_cents_per_hour` (see estimate-engine/painting.ts).
 * Reopening an estimate seeds the editor's "labor hours" field by inverting that,
 * so it MUST divide by the same cost rate the engine used — not a hardcoded rate
 * (TASK-127: a stale `/8500` here understated hours by ~40% since the cost rate
 * is $50, not $85).
 *
 * Returns null when there's no cost or no usable rate.
 */
export function laborHoursFromCostCents(
  internalLaborCostCents: number | null | undefined,
  costRateCentsPerHour: number | null | undefined,
): number | null {
  if (internalLaborCostCents == null) return null;
  if (!costRateCentsPerHour || costRateCentsPerHour <= 0) return null;
  return Math.round((internalLaborCostCents / costRateCentsPerHour) * 10) / 10;
}

/** Persist labor-only cost. Do not store engine estimatedCostCents (labor+materials). */
export function laborCostCentsFromHours(
  hours: number | null | undefined,
  costRateCentsPerHour: number | null | undefined,
): number | null {
  if (hours == null || hours <= 0) return null;
  if (!costRateCentsPerHour || costRateCentsPerHour <= 0) return null;
  return Math.round(hours * costRateCentsPerHour);
}
