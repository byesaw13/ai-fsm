/**
 * Deterministic materials takeoff for price_book code 1007
 * (Door hardware replacement). TASK-101 / CEO+eng Minimal Slice v1.
 *
 * Pure function — no DB, no AI. Emits SpecifiedMaterial rows suitable for
 * shopping_list_json.sections.specified_items (null catalog identity).
 */

import type { ShoppingList, ShoppingListSection, SpecifiedMaterial } from "../scope";

export const DOOR_HARDWARE_PRICE_BOOK_CODE = "1007" as const;

export type DoorHardwareType = "lockset" | "handle" | "hinge" | "mix";

export interface DoorHardwareTakeoffInput {
  hardwareType: DoorHardwareType;
  /** Number of doors / hardware sets. Must be > 0 for a non-empty takeoff. */
  unitCount: number;
  /**
   * When true, the primary hardware SKU is customer-supplied and is not put
   * on the buy list. Consumables (screws, strike plate, filler) still apply.
   */
  customerSupplied: boolean;
}

export interface DoorHardwareTakeoffResult {
  status: "ok" | "incomplete";
  items: SpecifiedMaterial[];
  warnings: string[];
  /** Section key used for idempotent merge/replace. */
  sectionName: string;
}

const SECTION = "Hardware & Fasteners";
const SERVICE = DOOR_HARDWARE_PRICE_BOOK_CODE;

function item(
  partial: Omit<SpecifiedMaterial, "service_code" | "store_section" | "waste_factor"> & {
    waste_factor?: number;
  },
): SpecifiedMaterial {
  return {
    store_section: SECTION,
    service_code: SERVICE,
    waste_factor: partial.waste_factor ?? 1,
    ...partial,
  };
}

/**
 * Compute package order qty: ceil(base * waste / packageSize) * packageSize units,
 * expressed as units_to_order in the package unit (usually "each" or "box").
 */
export function packageCeil(baseQty: number, packageSize: number, wasteFactor: number): number {
  if (baseQty <= 0 || packageSize <= 0) return 0;
  const withWaste = baseQty * wasteFactor;
  return Math.ceil(withWaste / packageSize);
}

export function computeDoorHardwareTakeoff(
  input: DoorHardwareTakeoffInput,
): DoorHardwareTakeoffResult {
  const warnings: string[] = [];
  const unitCount = Number(input.unitCount);

  if (!Number.isFinite(unitCount) || unitCount <= 0) {
    return {
      status: "incomplete",
      items: [],
      warnings: ["unitCount must be a positive number"],
      sectionName: SECTION,
    };
  }

  if (!["lockset", "handle", "hinge", "mix"].includes(input.hardwareType)) {
    return {
      status: "incomplete",
      items: [],
      warnings: [`unknown hardwareType: ${String(input.hardwareType)}`],
      sectionName: SECTION,
    };
  }

  const n = Math.floor(unitCount);
  if (n !== unitCount) {
    warnings.push("unitCount was floored to a whole number");
  }

  const items: SpecifiedMaterial[] = [];

  // Primary hardware — only when Dovetails supplies it
  if (!input.customerSupplied) {
    if (input.hardwareType === "lockset" || input.hardwareType === "mix") {
      items.push(
        item({
          name: "Passage/privacy lockset (builder grade)",
          sku: null,
          coverage_per_unit: 1,
          unit_label: "each",
          unit_cost_cents: null,
          quantity_needed: n,
          units_to_order: n,
          notes: "Dovetails-supplied; confirm finish with owner",
        }),
      );
    }
    if (input.hardwareType === "handle" || input.hardwareType === "mix") {
      items.push(
        item({
          name: "Door lever/handle set",
          sku: null,
          coverage_per_unit: 1,
          unit_label: "each",
          unit_cost_cents: null,
          quantity_needed: n,
          units_to_order: n,
          notes: "Dovetails-supplied; confirm finish with owner",
        }),
      );
    }
    if (input.hardwareType === "hinge" || input.hardwareType === "mix") {
      // 3 hinges per door typical residential
      const hingeCount = n * 3;
      items.push(
        item({
          name: "Door hinge 3.5\" (residential)",
          sku: null,
          coverage_per_unit: 1,
          unit_label: "each",
          unit_cost_cents: null,
          quantity_needed: hingeCount,
          units_to_order: hingeCount,
          notes: "3 hinges per door standard",
        }),
      );
    }
  } else {
    warnings.push("Primary hardware marked customer-supplied — not on buy list");
  }

  // Always: strike plate (1 per door for lockset/handle/mix; skip pure hinge-only)
  if (input.hardwareType !== "hinge") {
    items.push(
      item({
        name: "Door strike plate",
        sku: null,
        coverage_per_unit: 1,
        unit_label: "each",
        unit_cost_cents: null,
        quantity_needed: n,
        units_to_order: n,
        notes: "Match latch type",
      }),
    );
  }

  // Screws: ~8 per door set; sold in packs of 50
  const screwEach = n * 8;
  const screwPacks = packageCeil(screwEach, 50, 1.0);
  items.push(
    item({
      name: "Wood screws #8 × 1\" (box of 50)",
      sku: null,
      coverage_per_unit: 50,
      unit_label: "box",
      unit_cost_cents: null,
      quantity_needed: screwEach,
      units_to_order: Math.max(1, screwPacks),
      notes: `~${screwEach} screws needed; package rounded to boxes of 50`,
    }),
  );

  // Wood filler — one tube per job up to 4 doors, then +1 per 4
  const fillerTubes = Math.max(1, Math.ceil(n / 4));
  items.push(
    item({
      name: "Wood filler (small tube)",
      sku: null,
      coverage_per_unit: 1,
      unit_label: "each",
      unit_cost_cents: null,
      quantity_needed: fillerTubes,
      units_to_order: fillerTubes,
      notes: "Hinge/strike patch touch-up",
    }),
  );

  // Painter's caulk optional consumable — 1 tube per job
  items.push(
    item({
      name: "Paintable caulk (Alex Plus) — door frame touch-up",
      sku: null,
      coverage_per_unit: 1,
      unit_label: "tube",
      unit_cost_cents: null,
      quantity_needed: 1,
      units_to_order: 1,
      notes: "Optional if trim gaps after hardware swap",
    }),
  );

  return {
    status: "ok",
    items,
    warnings,
    sectionName: SECTION,
  };
}

/**
 * Idempotent merge: drop prior specified_items with service_code 1007, then add new.
 * Preserves computed_items and other specified items.
 */
export function mergeDoorHardwareTakeoffIntoShoppingList(
  list: ShoppingList | null | undefined,
  takeoff: DoorHardwareTakeoffResult,
): ShoppingList {
  const base: ShoppingList = list ?? {
    sections: [],
    total_catalog_cost_cents: 0,
    total_specified_cost_cents: 0,
    generated_at: new Date().toISOString(),
  };

  const stripped: ShoppingListSection[] = base.sections
    .map((sec) => ({
      ...sec,
      specified_items: sec.specified_items.filter((s) => s.service_code !== SERVICE),
      section_total_cents: 0, // recomputed below
    }))
    .filter((sec) => sec.computed_items.length > 0 || sec.specified_items.length > 0);

  if (takeoff.items.length === 0) {
    return recomputeTotals({ ...base, sections: stripped, generated_at: new Date().toISOString() });
  }

  // Prefer merging into existing Hardware & Fasteners section
  const idx = stripped.findIndex((s) => s.section === takeoff.sectionName);
  if (idx >= 0) {
    stripped[idx] = {
      ...stripped[idx],
      specified_items: [...stripped[idx].specified_items, ...takeoff.items],
    };
  } else {
    stripped.push({
      section: takeoff.sectionName,
      computed_items: [],
      specified_items: [...takeoff.items],
      section_total_cents: 0,
    });
  }

  return recomputeTotals({
    sections: stripped,
    total_catalog_cost_cents: 0,
    total_specified_cost_cents: 0,
    generated_at: new Date().toISOString(),
  });
}

function recomputeTotals(list: ShoppingList): ShoppingList {
  const sections = list.sections.map((sec) => ({
    ...sec,
    section_total_cents:
      sec.computed_items.reduce((s, m) => s + m.total_cost_cents, 0) +
      sec.specified_items.reduce(
        (s, m) => s + (m.unit_cost_cents ? m.units_to_order * m.unit_cost_cents : 0),
        0,
      ),
  }));
  return {
    sections,
    total_catalog_cost_cents: sections.reduce(
      (s, sec) => s + sec.computed_items.reduce((ss, m) => ss + m.total_cost_cents, 0),
      0,
    ),
    total_specified_cost_cents: sections.reduce(
      (s, sec) =>
        s +
        sec.specified_items.reduce(
          (ss, m) => ss + (m.unit_cost_cents ? m.units_to_order * m.unit_cost_cents : 0),
          0,
        ),
      0,
    ),
    generated_at: list.generated_at,
  };
}

export function serviceCodesForSnapshots(
  snapshots: Iterable<{ category: string | null; service_code: string | null }>,
  lines: Iterable<{ category: string | null; code: string | null }>,
): Array<string | null> {
  const snapshotList = Array.from(snapshots);
  const byCategory = new Map<string, Array<string | null>>();
  for (const line of lines) {
    if (!line.category) continue;
    const queue = byCategory.get(line.category) ?? [];
    queue.push(line.code);
    byCategory.set(line.category, queue);
  }
  const snapshotCounts = new Map<string, number>();
  for (const snapshot of snapshotList) {
    if (!snapshot.category) continue;
    const queue = byCategory.get(snapshot.category);
    if (snapshot.service_code) {
      const index = queue?.indexOf(snapshot.service_code) ?? -1;
      if (index >= 0) queue?.splice(index, 1);
    } else {
      snapshotCounts.set(snapshot.category, (snapshotCounts.get(snapshot.category) ?? 0) + 1);
    }
  }
  return snapshotList.map((snapshot) => {
    if (snapshot.service_code) return snapshot.service_code;
    if (!snapshot.category) return null;
    const queue = byCategory.get(snapshot.category);
    if (!queue || queue.length !== snapshotCounts.get(snapshot.category)) return null;
    snapshotCounts.set(snapshot.category, (snapshotCounts.get(snapshot.category) ?? 1) - 1);
    return queue.shift() ?? null;
  });
}

export function priceBookCodesFromLineRows(
  rows: Iterable<{ code: string | null; description: string | null }>,
): string[] {
  return Array.from(rows, (row) => row.code ?? row.description?.match(/^(\d{4})\b/)?.[1] ?? "")
    .filter(Boolean);
}

/** True when a price-book code list includes the 1007 pilot. */
export function includesDoorHardwareCode(codes: Iterable<string | null | undefined>): boolean {
  for (const c of codes) {
    if (c === DOOR_HARDWARE_PRICE_BOOK_CODE) return true;
  }
  return false;
}
