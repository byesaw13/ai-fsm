/**
 * Pure helpers for capturing the AI-proposed vs. founder-edited materials
 * delta (TASK T1 — materials estimate trust calibration, see
 * nick-main-design-20260807-200440-materials-estimate-trust-calibration.md,
 * Approach D). Framework-free so MaterialsGenerator.tsx (attaches the
 * snapshot), Step2Pricing.tsx (builds the delta to persist), and
 * useEstimateForm.ts (merges it into shopping_list_json) can all share one
 * tested implementation instead of re-deriving the logic three times.
 *
 * This does NOT build outcome-tap UI, auto-detection, or prompt
 * calibration — those are explicitly out of scope until this delta shows a
 * real pattern worth calibrating against.
 */

export interface MaterialItemLike {
  name: string;
  category: string;
  unit: string;
  quantity: number;
  unit_cost_cents: number;
  ai_quantity?: number;
  ai_unit_cost_cents?: number;
}

export interface AiMaterialsDeltaItem {
  name: string;
  category: string;
  unit: string;
  ai_quantity: number;
  quantity: number;
  ai_unit_cost_cents: number;
  unit_cost_cents: number;
}

/**
 * Snapshot each item's current quantity/unit_cost_cents into immutable
 * ai_quantity/ai_unit_cost_cents fields, once, at generation time — before
 * any founder edits happen. The snapshot travels with the item object
 * through edits and removals, so no index-based reconciliation is needed
 * later. Idempotent: never overwrites an existing snapshot.
 */
export function attachAiSnapshot<T extends MaterialItemLike>(items: T[]): T[] {
  return items.map((item) => ({
    ...item,
    ai_quantity: item.ai_quantity ?? item.quantity,
    ai_unit_cost_cents: item.ai_unit_cost_cents ?? item.unit_cost_cents,
  }));
}

/**
 * Build the persistable AI-proposed/founder-edited delta for items that
 * carry an immutable AI snapshot (i.e. came from the AI materials
 * generator). Items without a snapshot (e.g. manually-added price-book
 * items) are excluded — there is no AI-proposed value to compare against.
 */
export function buildAiMaterialsDelta(items: MaterialItemLike[]): AiMaterialsDeltaItem[] {
  return items
    .filter((item) => item.ai_quantity !== undefined && item.ai_unit_cost_cents !== undefined)
    .map((item) => ({
      name: item.name,
      category: item.category,
      unit: item.unit,
      ai_quantity: item.ai_quantity!,
      quantity: item.quantity,
      ai_unit_cost_cents: item.ai_unit_cost_cents!,
      unit_cost_cents: item.unit_cost_cents,
    }));
}

/**
 * Merge the AI materials delta into the shopping-list jsonb payload under
 * its own top-level key. `mapShoppingListJsonToLines` /
 * `mapRecomputedSectionsToLines` (lib/jobs/buy-list.ts) only ever read
 * `root.sections`, so this key is invisible to that consumer — no
 * collision risk. When there's no delta, returns `sl` unchanged (so the
 * existing no-AI-materials estimate path is byte-for-byte unaffected).
 * When `sl` is null but a delta exists, still emits an object carrying
 * just the delta rather than dropping it.
 */
export function withAiMaterialsDelta<T extends object>(
  sl: T | null,
  delta: AiMaterialsDeltaItem[]
): (T & { ai_materials_delta: AiMaterialsDeltaItem[] }) | T | null {
  if (delta.length === 0) return sl;
  return { ...(sl ?? ({} as T)), ai_materials_delta: delta };
}
