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
  /**
   * Stable identity linking this delta entry to the flattened LineItemRow it
   * came from (LineItemRow.ai_delta_key). Lets reconcileAiMaterialsDelta find
   * out, at submit time, whether the founder later removed or re-priced the
   * line after "Add to Estimate" — a flattened line item has no other way to
   * trace back to the delta entry it produced.
   */
  key: string;
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
 *
 * `keys`, if provided, must be the same length as `items` — each entry's
 * `key` links it back to the flattened LineItemRow it produced, so a later
 * `reconcileAiMaterialsDelta` call can tell whether the founder removed or
 * re-priced it after "Add to Estimate". Falls back to a fresh
 * `crypto.randomUUID()` per item when omitted (callers that don't need
 * reconciliation, e.g. tests).
 */
export function buildAiMaterialsDelta(
  items: MaterialItemLike[],
  keys?: string[]
): AiMaterialsDeltaItem[] {
  // Zip keys with items BEFORE filtering — keys is indexed against the
  // original items array, not the post-filter result.
  return items
    .map((item, i) => ({ item, key: keys?.[i] }))
    .filter(({ item }) => item.ai_quantity !== undefined && item.ai_unit_cost_cents !== undefined)
    .map(({ item, key }) => ({
      key: key ?? (typeof crypto !== "undefined" ? crypto.randomUUID() : `delta-${Math.random()}`),
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
 * At submit time, reconcile the accumulated delta against the estimate's
 * FINAL line items — the founder can edit or remove a materials-sourced
 * line directly in the line-items table after "Add to Estimate", and the
 * delta must not keep claiming founder-approval for a value that no longer
 * reflects what's actually on the estimate.
 *
 * - Entries whose `lineItemsByKey` line is gone entirely (removed) are
 *   dropped — recording "founder approved N" for a line the founder deleted
 *   would corrupt the calibration evidence, which is the actual bug this
 *   function exists to fix.
 * - Entries whose line survives but was re-priced (the flattened row's
 *   `unit_price` no longer matches quantity * ai-recorded unit_cost_cents)
 *   have `unit_cost_cents` recomputed from the line's current total, holding
 *   `quantity` at its original add-time value — a flattened LineItemRow has
 *   no separately-editable quantity field once quantity/unit are baked into
 *   its description string, so quantity-specific re-edits are not separately
 *   recoverable; the reconciled unit price is the best available signal of
 *   "did the founder's opinion of this line change after adding it."
 */
export function reconcileAiMaterialsDelta(
  delta: AiMaterialsDeltaItem[],
  lineItemsByKey: Map<string, { unit_price: string }>
): AiMaterialsDeltaItem[] {
  const reconciled: AiMaterialsDeltaItem[] = [];
  for (const entry of delta) {
    const line = lineItemsByKey.get(entry.key);
    if (!line) continue; // removed — drop, do not claim stale approval
    const currentTotalCents = Math.round(parseFloat(line.unit_price) * 100);
    if (Number.isFinite(currentTotalCents) && entry.quantity > 0) {
      const reconciledUnitCostCents = Math.round(currentTotalCents / entry.quantity);
      reconciled.push({ ...entry, unit_cost_cents: reconciledUnitCostCents });
    } else {
      reconciled.push(entry);
    }
  }
  return reconciled;
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
