/**
 * Fuel receipt helpers — TASK-113.
 * A fuel expense is money. The truck fill is a separate vehicle_fuel_logs row.
 */

export function isFuelExpenseCategory(category: string | null | undefined): boolean {
  return category === "fuel" || category === "vehicle_fuel";
}

/** Pull gallons from receipt text like "23.707 gallons at $3.749/gal". */
export function parseGallonsFromFuelText(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = text.match(/(\d{1,3}(?:\.\d{1,3})?)\s*(?:gallons?|gals?)\b/i);
  if (!match?.[1]) return null;
  return coerceGallons(Number(match[1]));
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

export function gallonsFromParsedReceipt(input: {
  category?: string | null;
  gallons?: unknown;
  notes?: string | null;
  line_items?: { name?: string | null; quantity?: number | null }[] | null;
}): number | null {
  const direct = coerceGallons(input.gallons);
  if (direct != null) return direct;

  const fromNotes = parseGallonsFromFuelText(input.notes);
  if (fromNotes != null) return fromNotes;

  if (!isFuelExpenseCategory(input.category ?? null)) return null;
  const items = input.line_items ?? [];
  for (const item of items) {
    const name = (item.name ?? "").toLowerCase();
    const fuelish = /\b(unl|unld|unleaded|diesel|regular|plus|premium|gas|fuel)\b/.test(name);
    if (!fuelish) continue;
    const qty = coerceGallons(item.quantity);
    if (qty != null && qty > 1) return qty;
  }
  return null;
}
