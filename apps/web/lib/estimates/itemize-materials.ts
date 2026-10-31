import { pooledPaint, type AssessmentSummary, type PreparedMaterialList, type PreparedScope, type ShoppingList } from "@ai-fsm/domain";
import {
  MaterialsGenerationError,
  type GenerateMaterialsInput,
  type MaterialsResult,
  type SavedMaterial,
} from "@/lib/estimates/materials-generator";
import { describeAiFailure } from "@/lib/estimates/ai-failure";

/**
 * Itemized materials per work area (TASK-187). Each group's included tasks go
 * through the existing materials generator, which prices from the owner's
 * saved materials first and labels everything else as an estimate. The lists
 * replace the group's materials allowance and feed the job's buy list on Apply.
 * Everything here except the generator it is given is pure.
 */

/** What the generator is asked to list for one group. */
export function groupMaterialsScope(scope: PreparedScope, groupKey: string): string {
  const label = scope.groups.find((g) => g.key === groupKey)?.label ?? groupKey;
  const tasks = scope.tasks.filter((t) => t.group_key === groupKey && t.confirmed);
  const lines = tasks.map((t) => {
    const q = t.quantity?.value != null ? ` (${Math.round(t.quantity.value * 10) / 10} ${t.quantity.unit})` : "";
    return `- ${t.description}${q}`;
  });
  return `Work area: ${label}\nOnly list materials for this work:\n${lines.join("\n")}`;
}

/** The generator's result as a stored list. */
export function toMaterialList(result: MaterialsResult, taskIds: string[]): PreparedMaterialList {
  return {
    task_ids: taskIds,
    lines: result.items.slice(0, 100).map((item, i) => ({
      id: `m${i + 1}`,
      name: (item.brand ? `${item.brand} ${item.name}` : item.name).slice(0, 200),
      quantity: Math.max(0, item.quantity),
      unit: (item.unit || "each").slice(0, 40),
      unit_cost_cents: Number.isFinite(item.unit_cost_cents) && item.unit_cost_cents >= 0 ? Math.round(item.unit_cost_cents) : null,
      source: item.price_book_id ? "your_price" : "ai_estimate",
      price_book_id: item.price_book_id,
      notes: (item.notes ?? "").slice(0, 500),
    })),
    customer_supplied: result.excluded_customer_supplied_items.slice(0, 50).map((s) => s.slice(0, 200)),
    assumptions: result.assumptions.slice(0, 50).map((s) => s.slice(0, 500)),
  };
}

export interface ItemizeResult {
  scope: PreparedScope;
  failed: Array<{ group_key: string; message: string }>;
}

/**
 * List materials for the given groups and store them on the scope. A group
 * with no included tasks is skipped; a group whose generation fails keeps its
 * allowance and is reported.
 */
export async function itemizeGroups(
  scope: PreparedScope,
  summary: AssessmentSummary,
  groupKeys: string[],
  saved: SavedMaterial[],
  generate: (input: GenerateMaterialsInput) => Promise<MaterialsResult>,
): Promise<ItemizeResult> {
  const keys = [...new Set(groupKeys)].filter((k) => scope.tasks.some((t) => t.group_key === k && t.confirmed));
  const results = await Promise.allSettled(
    keys.map(async (key) => {
      const tasks = scope.tasks.filter((t) => t.group_key === key && t.confirmed);
      const roomIds = new Set(tasks.map((t) => t.room_id).filter(Boolean));
      const result = await generate({
        scope: groupMaterialsScope(scope, key),
        job_type: "general",
        rooms: summary.rooms.filter((r) => roomIds.has(r.id)),
        saved_materials: saved,
      });
      return [key, toMaterialList(result, tasks.map((t) => t.id))] as const;
    }),
  );
  const materials = { ...(scope.materials ?? {}) };
  const failed: ItemizeResult["failed"] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") materials[r.value[0]] = r.value[1];
    else {
      const message = r.reason instanceof MaterialsGenerationError ? r.reason.message : describeAiFailure(r.reason).message;
      failed.push({ group_key: keys[i], message });
    }
  });
  return { scope: { ...scope, materials }, failed };
}

/**
 * The itemized lists as the standard shopping list (`estimates.shopping_list_json`,
 * the `ShoppingList` shape the buy list, the shopping-list page and the print page
 * read): one section per work area, each line a specified item. Null only when
 * the quote was never itemized, so another list is kept; once itemized, zeroed or
 * cleared materials give an empty list that replaces the old one. TASK-223: an
 * earlier shape left out `specified_items`, which crashed the print and
 * shopping-list pages.
 */
export function preparedShoppingList(scope: PreparedScope): ShoppingList | null {
  if (!scope.materials) return null;
  // Paint shared by rooms is bought together (TASK-227): off the room sections, onto one.
  const pooled = pooledPaint(scope);
  const pooledRefs = new Set(pooled.flatMap((p) => p.line_refs));
  const labels = new Map(scope.groups.map((g) => [g.key, g.label]));
  const item = (section: string, name: string, unit: string, unitCost: number | null, qty: number, notes: string | null) => ({
    name,
    sku: null,
    coverage_per_unit: null,
    unit_label: unit,
    unit_cost_cents: unitCost,
    quantity_needed: qty,
    waste_factor: 1,
    units_to_order: qty,
    store_section: section,
    service_code: "prepared_scope",
    notes,
  });
  const section = (name: string, specified_items: ReturnType<typeof item>[]) => ({
    section: name,
    computed_items: [],
    specified_items,
    section_total_cents: specified_items.reduce((s, i) => s + Math.round((i.unit_cost_cents ?? 0) * i.units_to_order), 0),
  });
  const sections = Object.entries(scope.materials)
    .map(([key, list]) => {
      const label = labels.get(key) ?? key;
      const lines = list.lines.filter((l) => l.quantity > 0 && !pooledRefs.has(`${key}/${l.id}`));
      return section(label, lines.map((l) => item(label, l.name, l.unit, l.unit_cost_cents, l.quantity, l.notes || null)));
    })
    .filter((sec) => sec.specified_items.length > 0);
  if (pooled.length) {
    const label = "Paint (bought together)";
    const items = pooled.flatMap((p) => {
      const note = `${p.needed} gal needed across ${Object.keys(p.shares).length} rooms`;
      return [
        p.pails > 0 ? item(label, p.name, "5-gal pail", p.unit_cost_cents * 5, p.pails, note) : null,
        p.gallons > 0 ? item(label, p.name, "gallon", p.unit_cost_cents, p.gallons, note) : null,
        p.quarts > 0 ? item(label, p.name, "quart", Math.round(p.unit_cost_cents / 4), p.quarts, note) : null,
      ].filter((i) => i !== null);
    });
    sections.push(section(label, items));
  }
  return {
    sections,
    total_catalog_cost_cents: 0,
    total_specified_cost_cents: sections.reduce((s, sec) => s + sec.section_total_cents, 0),
    generated_at: new Date().toISOString(),
  };
}
