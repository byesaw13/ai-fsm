/**
 * Pure helpers for job-owned materials buy list (TASK-082).
 * Mapping / merge only — no DB.
 */

export type BuyListStatus = "needed" | "purchased" | "on_truck" | "not_needed";
export type BuyListSource = "estimate" | "kit" | "ai" | "manual";

export interface BuyListLineInput {
  name: string;
  quantity: number;
  unit_label: string | null;
  store_section: string | null;
  status: BuyListStatus;
  source: BuyListSource;
  catalog_material_id: string | null;
  sku: string | null;
  notes: string | null;
  sort_order: number;
}

export function matchKey(name: string, unitLabel: string | null | undefined): string {
  const n = name.trim().toLowerCase();
  const u = (unitLabel ?? "").trim().toLowerCase();
  return `${n}||${u}`;
}

/** Normalize free-form quantity; floor at 0.001. */
export function normalizeQuantity(q: unknown, fallback = 1): number {
  const n = typeof q === "number" ? q : parseFloat(String(q ?? ""));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

type LooseRecord = Record<string, unknown>;

function asRecord(v: unknown): LooseRecord | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as LooseRecord) : null;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/**
 * Map stored shopping_list_json (ShoppingList shape) → buy list lines.
 * Handles computed_items (catalog materials) and specified_items (free-text).
 */
export function mapShoppingListJsonToLines(json: unknown): BuyListLineInput[] {
  if (json == null) return [];
  const root = asRecord(json);
  if (!root) return [];

  const sections = asArray(root.sections);
  const lines: BuyListLineInput[] = [];
  let sort = 0;

  for (const sec of sections) {
    const section = asRecord(sec);
    if (!section) continue;
    const sectionName =
      typeof section.section === "string" && section.section.trim()
        ? section.section.trim()
        : null;

    for (const raw of asArray(section.computed_items)) {
      const item = asRecord(raw);
      if (!item) continue;
      const material = asRecord(item.material) ?? item;
      const name =
        (typeof material.material_name === "string" && material.material_name) ||
        (typeof material.name === "string" && material.name) ||
        "";
      if (!name.trim()) continue;
      const qty = normalizeQuantity(item.quantity ?? material.quantity, 1);
      const unit =
        (typeof material.unit === "string" && material.unit) ||
        (typeof material.unit_label === "string" && material.unit_label) ||
        null;
      const store =
        (typeof material.store_section === "string" && material.store_section) ||
        sectionName;
      const catalogId =
        (typeof material.id === "string" && material.id) ||
        (typeof item.catalog_material_id === "string" && item.catalog_material_id) ||
        null;
      lines.push({
        name: name.trim(),
        quantity: qty,
        unit_label: unit,
        store_section: store,
        status: "needed",
        source: "estimate",
        catalog_material_id: catalogId,
        sku: typeof material.sku === "string" ? material.sku : null,
        notes: typeof material.description === "string" ? material.description : null,
        sort_order: sort++,
      });
    }

    for (const raw of asArray(section.specified_items)) {
      const item = asRecord(raw);
      if (!item) continue;
      const name = typeof item.name === "string" ? item.name.trim() : "";
      if (!name) continue;
      const qty = normalizeQuantity(
        item.units_to_order ?? item.quantity_needed ?? item.quantity,
        1,
      );
      const unit =
        (typeof item.unit_label === "string" && item.unit_label) ||
        (typeof item.unit === "string" && item.unit) ||
        null;
      const store =
        (typeof item.store_section === "string" && item.store_section) || sectionName;
      lines.push({
        name,
        quantity: qty,
        unit_label: unit,
        store_section: store,
        status: "needed",
        source: "estimate",
        catalog_material_id: null,
        sku: typeof item.sku === "string" ? item.sku : null,
        notes: typeof item.notes === "string" ? item.notes : null,
        sort_order: sort++,
      });
    }
  }

  return lines;
}

/**
 * Map recomputed shopping-list API style sections
 * `{ section, items: [{ material, quantity }] }` → lines.
 */
export function mapRecomputedSectionsToLines(
  sections: Array<{
    section?: string;
    items?: Array<{
      material?: {
        id?: string;
        material_name?: string;
        unit?: string;
        store_section?: string;
        description?: string | null;
      };
      quantity?: number;
    }>;
  }>,
): BuyListLineInput[] {
  const lines: BuyListLineInput[] = [];
  let sort = 0;
  for (const sec of sections) {
    const sectionName = sec.section?.trim() || null;
    for (const item of sec.items ?? []) {
      const m = item.material;
      const name = m?.material_name?.trim();
      if (!m || !name) continue;
      lines.push({
        name,
        quantity: normalizeQuantity(item.quantity, 1),
        unit_label: m.unit ?? null,
        store_section: m.store_section || sectionName,
        status: "needed",
        source: "estimate",
        catalog_material_id: m.id ?? null,
        sku: null,
        notes: m.description ?? null,
        sort_order: sort++,
      });
    }
  }
  return lines;
}

export interface ExistingLineKey {
  name: string;
  unit_label: string | null;
}

/**
 * Re-seed / kit merge: append candidates whose match key is not already present.
 * Never lowers qty, never deletes.
 */
export function mergeMissingLines<T extends ExistingLineKey>(
  existing: T[],
  candidates: BuyListLineInput[],
): BuyListLineInput[] {
  const seen = new Set(existing.map((e) => matchKey(e.name, e.unit_label)));
  const out: BuyListLineInput[] = [];
  let sortBase = existing.length;
  for (const c of candidates) {
    const key = matchKey(c.name, c.unit_label);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...c, sort_order: sortBase++ });
  }
  return out;
}

/** Group lines by store section for UI (null → "Other"). */
export function groupByStoreSection<T extends { store_section: string | null }>(
  lines: T[],
): Array<{ section: string; lines: T[] }> {
  const map = new Map<string, T[]>();
  for (const line of lines) {
    const sec = line.store_section?.trim() || "Other";
    if (!map.has(sec)) map.set(sec, []);
    map.get(sec)!.push(line);
  }
  return Array.from(map.entries()).map(([section, sectionLines]) => ({
    section,
    lines: sectionLines,
  }));
}
