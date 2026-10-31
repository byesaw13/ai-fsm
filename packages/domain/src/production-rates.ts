/**
 * Hours from a production rate (TASK-193).
 *
 * A per-day rate is a pace over the account's hours-per-day (default 8).
 * 400 sq ft/day at 8 hours is 50 sq ft/hour.
 * Modifiers change throughput. A negative modifier is slower, so the hours grow.
 * The result is calibrated only when the rate and every modifier are calibrated.
 */

export interface ProductionRateInput {
  base_rate: number;
  rate_unit: string;
  calibrated: boolean;
}

export interface ProductionRateModifierInput {
  modifier_pct: number;
  calibrated: boolean;
}

export interface ProductionRateHours {
  hours: number;
  calibrated: boolean;
}

export function productionRateHours(
  quantity: number,
  rate: ProductionRateInput,
  modifiers: ProductionRateModifierInput[],
  hoursPerDay: number,
): ProductionRateHours {
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error("Quantity must be zero or more");
  }
  if (!Number.isFinite(rate.base_rate) || rate.base_rate <= 0) {
    throw new Error("Production rate must be greater than zero");
  }
  const perDay = !rate.rate_unit.endsWith("_per_hour");
  if (perDay && (!Number.isFinite(hoursPerDay) || hoursPerDay <= 0)) {
    throw new Error("Hours per day must be greater than zero");
  }
  const throughput = 1 + modifiers.reduce((sum, modifier) => sum + modifier.modifier_pct, 0);
  if (throughput <= 0) {
    throw new Error("Modifiers slow the rate to nothing");
  }
  const rawHours = perDay ? (quantity / rate.base_rate) * hoursPerDay : quantity / rate.base_rate;
  return {
    hours: rawHours / throughput,
    calibrated: rate.calibrated && modifiers.every((modifier) => modifier.calibrated),
  };
}
