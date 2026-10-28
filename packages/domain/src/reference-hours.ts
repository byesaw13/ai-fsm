/**
 * Craftsman reference hours on a price book code (TASK-218).
 *
 * Each entry is one owner-reviewed, cited line from a Craftsman costbook.
 * Display only: nothing that sets a price or line hours may read these.
 * Hours are worker-hours per unit and exclude travel and setup.
 */

import { z } from "zod";

export const REFERENCE_HOURS_UNITS = ["Ea", "LF", "SF", "SY", "step"] as const;

const hours = z.number().finite().nonnegative();

export const referenceHoursEntrySchema = z.object({
  source: z.literal("craftsman"),
  book: z.string().trim().min(1).max(120),
  edition: z.string().trim().max(60).optional(),
  line: z.string().trim().min(1).max(300),
  unit: z.enum(REFERENCE_HOURS_UNITS),
  install_hours: hours,
  remove_hours: hours.optional(),
  reset_hours: hours.optional(),
  minimum_hours: hours.optional(),
  includes: z.string().trim().max(500).optional(),
  captured_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().max(300).optional(),
});

export type ReferenceHoursEntry = z.infer<typeof referenceHoursEntrySchema>;

/** Valid entries from a stored jsonb value; anything malformed is dropped. */
export function parseReferenceHours(value: unknown): ReferenceHoursEntry[] {
  if (!Array.isArray(value)) return [];
  const out: ReferenceHoursEntry[] = [];
  for (const item of value) {
    const parsed = referenceHoursEntrySchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

export interface ReferenceSwapHours {
  install: number;
  remove: number;
  /** install + remove for the quantity */
  swap: number;
  /** swap, raised to the minimum when one is set */
  total: number;
  minimumApplied: boolean;
}

/** Swap hours (install + remove) for a quantity, with the trade minimum as a floor. */
export function referenceSwapHours(entry: ReferenceHoursEntry, quantity = 1): ReferenceSwapHours {
  const qty = Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
  const install = entry.install_hours * qty;
  const remove = (entry.remove_hours ?? 0) * qty;
  const swap = install + remove;
  const minimum = entry.minimum_hours ?? 0;
  const minimumApplied = qty > 0 && minimum > swap;
  return {
    install,
    remove,
    swap,
    total: minimumApplied ? minimum : swap,
    minimumApplied,
  };
}
