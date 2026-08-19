/**
 * Fuel receipt helpers — TASK-113.
 * A fuel expense is money. The truck fill is a separate vehicle_fuel_logs row.
 */

export function isFuelExpenseCategory(category: string | null | undefined): boolean {
  return category === "fuel" || category === "vehicle_fuel";
}

/** Pump $/gal from notes like "23.707 gallons at $3.749/gal". */
export function unitPriceFromFuelText(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = text.match(/\$(\d+(?:\.\d{1,3})?)\s*\/\s*gal/i);
  if (!match?.[1]) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n < 1.5 || n > 8) return null;
  return Math.round(n * 1000) / 1000;
}

/**
 * Pull gallons from receipt text like "23.707 gallons at $3.749/gal".
 * Skips a figure that is just the pump price copied as gallons (OCR mix-up).
 */
export function parseGallonsFromFuelText(text: string | null | undefined): number | null {
  if (!text) return null;
  const price = unitPriceFromFuelText(text);
  const matches = text.matchAll(/(\d{1,3}(?:\.\d{1,3})?)\s*(?:gallons?|gals?)\b/gi);
  for (const match of matches) {
    const n = coerceGallons(Number(match[1]));
    if (n == null) continue;
    if (price != null && Math.abs(n - price) < 0.05) continue;
    return n;
  }
  return null;
}

export function coerceGallons(value: unknown): number | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const fromWords = parseGallonsFromFuelText(trimmed);
    if (fromWords != null) return fromWords;
    const n = Number(trimmed);
    return coerceGallons(n);
  }
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value <= 0 || value > 500) return null;
  return Math.round(value * 1000) / 1000;
}

export type FuelReceiptReview = {
  warnings: string[];
  dollarsPerGallon: number | null;
  impliedGallons: number | null;
  gallonsLooksLikePrice: boolean;
};

/** Catch OCR mixing $/gal with gallons, and total vs gallons mismatch. */
export function reviewFuelReceipt(input: {
  gallons: number | null;
  amountCents: number | null;
  notes?: string | null;
}): FuelReceiptReview {
  const warnings: string[] = [];
  const price = unitPriceFromFuelText(input.notes ?? null);
  const impliedGallons =
    price != null && input.amountCents != null && price > 0
      ? coerceGallons(input.amountCents / 100 / price)
      : null;
  const dollarsPerGallon =
    input.gallons != null && input.gallons > 0 && input.amountCents != null
      ? Math.round((input.amountCents / 100 / input.gallons) * 1000) / 1000
      : price;

  const gallonsLooksLikePrice =
    input.gallons != null && price != null && Math.abs(input.gallons - price) < 0.05;

  if (gallonsLooksLikePrice) {
    warnings.push(
      `Gallons ${input.gallons} matches the pump price. That is usually the $/gal figure, not the fill.`,
    );
  }
  if (
    impliedGallons != null &&
    input.gallons != null &&
    Math.abs(impliedGallons - input.gallons) / impliedGallons > 0.15
  ) {
    warnings.push(
      `Receipt total implies about ${impliedGallons} gal at $${price}/gal, not ${input.gallons}.`,
    );
  }
  if (dollarsPerGallon != null && (dollarsPerGallon < 2 || dollarsPerGallon > 7)) {
    warnings.push(`$${dollarsPerGallon.toFixed(3)}/gal is outside the usual $2–$7 range.`);
  }

  return { warnings, dollarsPerGallon, impliedGallons, gallonsLooksLikePrice };
}

export function gallonsFromParsedReceipt(input: {
  category?: string | null;
  gallons?: unknown;
  notes?: string | null;
  amountCents?: number | null;
  line_items?: { name?: string | null; quantity?: number | null }[] | null;
}): number | null {
  let gallons = coerceGallons(input.gallons);
  if (gallons == null) gallons = parseGallonsFromFuelText(input.notes);

  if (gallons == null && isFuelExpenseCategory(input.category ?? null)) {
    const items = input.line_items ?? [];
    for (const item of items) {
      const name = (item.name ?? "").toLowerCase();
      const fuelish = /\b(unl|unld|unleaded|diesel|regular|plus|premium|gas|fuel)\b/.test(name);
      if (!fuelish) continue;
      const qty = coerceGallons(item.quantity);
      if (qty != null && qty > 1) {
        gallons = qty;
        break;
      }
    }
  }

  const review = reviewFuelReceipt({
    gallons,
    amountCents: input.amountCents ?? null,
    notes: input.notes,
  });
  if (review.gallonsLooksLikePrice && review.impliedGallons != null) {
    return review.impliedGallons;
  }
  return gallons;
}

export function pickOdometerForFuelDay(input: {
  sameDayStart: number | null;
  previousDayEnd: number | null;
}): { odometer: number; source: "same_day_start" | "previous_day_end" } | null {
  if (input.sameDayStart != null && input.sameDayStart > 0) {
    return { odometer: Math.round(input.sameDayStart), source: "same_day_start" };
  }
  if (input.previousDayEnd != null && input.previousDayEnd > 0) {
    return { odometer: Math.round(input.previousDayEnd), source: "previous_day_end" };
  }
  return null;
}

/** Historical fills: flag only if the reading is outside neighboring fills. */
export function odometerOutOfHistory(input: {
  odometer: number;
  priorOdometer: number | null;
  nextOdometer: number | null;
}): boolean {
  if (input.priorOdometer != null && input.odometer < input.priorOdometer) return true;
  if (input.nextOdometer != null && input.odometer > input.nextOdometer) return true;
  return false;
}
