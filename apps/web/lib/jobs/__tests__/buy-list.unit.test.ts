import { describe, expect, it } from "vitest";
import {
  groupByStoreSection,
  mapRecomputedSectionsToLines,
  mapShoppingListJsonToLines,
  matchKey,
  mergeMissingLines,
  normalizeQuantity,
} from "../buy-list";

describe("matchKey", () => {
  it("is case-insensitive on name and unit", () => {
    expect(matchKey("Wax Ring", "ea")).toBe(matchKey("wax ring", "EA"));
  });

  it("treats null/empty unit the same", () => {
    expect(matchKey("Caulk", null)).toBe(matchKey("Caulk", ""));
    expect(matchKey("Caulk", null)).toBe(matchKey("caulk", undefined));
  });
});

describe("normalizeQuantity", () => {
  it("falls back for invalid", () => {
    expect(normalizeQuantity(null)).toBe(1);
    expect(normalizeQuantity(-3)).toBe(1);
    expect(normalizeQuantity("nope")).toBe(1);
  });

  it("keeps positive numbers", () => {
    expect(normalizeQuantity(2.5)).toBe(2.5);
    expect(normalizeQuantity("3")).toBe(3);
  });
});

describe("mapShoppingListJsonToLines", () => {
  it("returns empty for null/invalid", () => {
    expect(mapShoppingListJsonToLines(null)).toEqual([]);
    expect(mapShoppingListJsonToLines({})).toEqual([]);
    expect(mapShoppingListJsonToLines("x")).toEqual([]);
  });

  it("maps computed and specified items", () => {
    const lines = mapShoppingListJsonToLines({
      sections: [
        {
          section: "Plumbing",
          computed_items: [
            {
              quantity: 2,
              material: {
                id: "mat-1",
                material_name: "Shutoff Valve",
                unit: "ea",
                store_section: "Plumbing",
                description: "1/2 inch",
              },
            },
          ],
          specified_items: [
            {
              name: "Wax Ring",
              units_to_order: 1,
              unit_label: "ea",
              store_section: "Plumbing",
              sku: "WR-1",
              notes: null,
            },
          ],
        },
      ],
    });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      name: "Shutoff Valve",
      quantity: 2,
      unit_label: "ea",
      store_section: "Plumbing",
      source: "estimate",
      status: "needed",
      catalog_material_id: "mat-1",
    });
    expect(lines[1]).toMatchObject({
      name: "Wax Ring",
      quantity: 1,
      source: "estimate",
      sku: "WR-1",
    });
  });
});

describe("mapRecomputedSectionsToLines", () => {
  it("maps API-style recompute sections", () => {
    const lines = mapRecomputedSectionsToLines([
      {
        section: "Paint & Supplies",
        items: [
          {
            quantity: 3,
            material: {
              id: "p1",
              material_name: "Primer",
              unit: "gal",
              store_section: "Paint & Supplies",
            },
          },
        ],
      },
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0].name).toBe("Primer");
    expect(lines[0].quantity).toBe(3);
  });
});

describe("mergeMissingLines", () => {
  it("adds only missing keys", () => {
    const existing = [{ name: "Wax Ring", unit_label: "ea" }];
    const candidates = [
      {
        name: "Wax Ring",
        quantity: 5,
        unit_label: "ea",
        store_section: "Plumbing",
        status: "needed" as const,
        source: "estimate" as const,
        catalog_material_id: null,
        sku: null,
        notes: null,
        sort_order: 0,
      },
      {
        name: "Shutoff",
        quantity: 1,
        unit_label: "ea",
        store_section: "Plumbing",
        status: "needed" as const,
        source: "estimate" as const,
        catalog_material_id: null,
        sku: null,
        notes: null,
        sort_order: 1,
      },
    ];
    const added = mergeMissingLines(existing, candidates);
    expect(added).toHaveLength(1);
    expect(added[0].name).toBe("Shutoff");
  });
});

describe("groupByStoreSection", () => {
  it("groups and uses Other for null", () => {
    const groups = groupByStoreSection([
      { store_section: "Plumbing", name: "a" },
      { store_section: null, name: "b" },
      { store_section: "Plumbing", name: "c" },
    ]);
    expect(groups.find((g) => g.section === "Plumbing")?.lines).toHaveLength(2);
    expect(groups.find((g) => g.section === "Other")?.lines).toHaveLength(1);
  });
});
