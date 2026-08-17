import { describe, expect, it, vi } from "vitest";
import {
  buildStoreRunStops,
  filterStoreRunLines,
  groupByStoreSection,
  mapRecomputedSectionsToLines,
  mapShoppingListJsonToLines,
  matchKey,
  mergeMissingLines,
  normalizeQuantity,
  summarizeStoreRun,
  type BuyListLineInput,
  type StoreRunLine,
} from "../buy-list";
import { buildSeedLinesFromEstimate, hydrateBuyListLocations } from "../buy-list-seed";

const baseBuyListLine: BuyListLineInput = {
  name: "Deck screws",
  quantity: 1,
  unit_label: "box",
  store_section: "Fasteners",
  status: "needed",
  source: "estimate",
  catalog_material_id: null,
  sku: null,
  notes: null,
  sort_order: 0,
};

const line = (overrides: Partial<StoreRunLine>): StoreRunLine => ({
  id: crypto.randomUUID(),
  name: "Deck screws",
  quantity: 1,
  unit_label: "box",
  store_section: "Fasteners",
  status: "needed",
  supplier: "Home Depot",
  aisle: null,
  bay: null,
  catalog_material_id: null,
  unit_cost_cents: null,
  ...overrides,
});

describe("hydrateBuyListLocations", () => {
  it("copies saved catalog purchasing data without inventing free-text locations", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{
        id: "catalog-1",
        name: "Screws",
        unit: "ea",
        supplier: "Home Depot",
        aisle: "12",
        bay: "4",
      }],
    });
    const lines: BuyListLineInput[] = [
      { ...baseBuyListLine, name: "Screws", unit_label: "ea", catalog_material_id: "catalog-1" },
      { ...baseBuyListLine, name: "Custom trim", catalog_material_id: null },
    ];

    await expect(
      hydrateBuyListLocations({ query } as never, "account-1", lines),
    ).resolves.toMatchObject([
      { supplier: "Home Depot", aisle: "12", bay: "4", catalog_material_id: "catalog-1" },
      { supplier: null, aisle: null, bay: null },
    ]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("materials_price_book"),
      ["account-1", ["catalog-1"], expect.arrayContaining(["screws", "custom trim"])],
    );
  });

  it("resolves location by name+unit when catalog id is a service_materials id", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{
        id: "mpb-real",
        name: "Drywall screws",
        unit: "box",
        supplier: "Home Depot",
        aisle: "13",
        bay: null,
      }],
    });
    const lines: BuyListLineInput[] = [
      {
        ...baseBuyListLine,
        name: "Drywall screws",
        unit_label: "box",
        // service_materials id — not a materials_price_book row
        catalog_material_id: "service-mat-1",
      },
    ];

    await expect(
      hydrateBuyListLocations({ query } as never, "account-1", lines),
    ).resolves.toMatchObject([
      {
        supplier: "Home Depot",
        aisle: "13",
        bay: null,
        // remapped to the real price-book id for remember-for-future
        catalog_material_id: "mpb-real",
      },
    ]);
  });
});

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

  // TASK-101: door hardware takeoff uses service_code 1007 → source kit
  it("maps service_code 1007 specified items as source kit", () => {
    const lines = mapShoppingListJsonToLines({
      sections: [
        {
          section: "Hardware & Fasteners",
          computed_items: [],
          specified_items: [
            {
              name: "Door strike plate",
              units_to_order: 1,
              unit_label: "each",
              store_section: "Hardware & Fasteners",
              service_code: "1007",
              notes: "Match latch type",
            },
          ],
        },
      ],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      name: "Door strike plate",
      source: "kit",
      catalog_material_id: null,
    });
  });

  // TASK T1 (materials trust calibration): ai_materials_delta is a new
  // top-level key added to shopping_list_json alongside `sections`, used to
  // persist the AI-proposed vs. founder-edited materials delta. This mapper
  // must ignore it — it only ever reads root.sections — so the job-buy-list
  // seeding consumer of this column can't be silently corrupted by it.
  it("ignores a sibling ai_materials_delta key — buy-list output is unaffected", () => {
    const base = {
      sections: [
        {
          section: "Plumbing",
          computed_items: [
            {
              quantity: 2,
              material: { id: "mat-1", material_name: "Shutoff Valve", unit: "ea" },
            },
          ],
          specified_items: [],
        },
      ],
    };
    const withoutDelta = mapShoppingListJsonToLines(base);
    const withDelta = mapShoppingListJsonToLines({
      ...base,
      ai_materials_delta: [
        {
          name: "5/4x6x12 PT decking",
          category: "lumber",
          unit: "board",
          ai_quantity: 8,
          quantity: 10,
          ai_unit_cost_cents: 1500,
          unit_cost_cents: 1300,
        },
      ],
    });
    expect(withDelta).toEqual(withoutDelta);
    expect(withDelta.some((l) => l.name.includes("decking"))).toBe(false);
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

  // mapRecomputedSectionsToLines takes a typed `sections` array directly
  // (never the wrapping shopping_list_json object), so an ai_materials_delta
  // key can't reach it structurally — this pins that invariant regardless.
  it("ignores an ai_materials_delta property tacked onto the sections array", () => {
    const sections = [
      {
        section: "Paint & Supplies",
        items: [
          { quantity: 1, material: { id: "p1", material_name: "Primer", unit: "gal" } },
        ],
      },
    ];
    (sections as unknown as Record<string, unknown>).ai_materials_delta = [{ name: "should not appear" }];
    const lines = mapRecomputedSectionsToLines(sections);
    expect(lines).toHaveLength(1);
    expect(lines[0].name).toBe("Primer");
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

describe("Store Run helpers", () => {
  it("includes only selected-supplier and unassigned needed lines", () => {
    const selected = filterStoreRunLines(
      [
        line({ id: "hd", supplier: " Home Depot " }),
        line({ id: "none", supplier: null }),
        line({ id: "lowes", supplier: "Lowe's" }),
        line({ id: "truck", supplier: "Home Depot", status: "on_truck" }),
        line({ id: "done", supplier: "Home Depot", status: "purchased" }),
      ],
      "home depot",
    );
    expect(selected.map(({ id }) => id)).toEqual(["hd", "none"]);
  });

  it("orders numeric aisles first, then department-only, then unknown", () => {
    const stops = buildStoreRunStops([
      line({ id: "a13", store_section: "Fasteners", aisle: "Aisle 13" }),
      line({ id: "a4", store_section: "Lumber", aisle: "4", bay: "7" }),
      line({ id: "paint", store_section: "Paint", aisle: null }),
      line({ id: "unknown", store_section: null, aisle: "Rear wall" }),
      // Mid-string numbers are not aisle numbers
      line({ id: "bay-text", store_section: "Misc", aisle: "Rear wall near bay 12" }),
    ]);
    expect(stops.map(({ key }) => key)).toEqual([
      "Lumber::4",
      "Fasteners::13",
      "Paint::department",
      "Misc::unknown",
      "Unknown Location::unknown",
    ]);
    expect(stops[0].lines.map(({ id }) => id)).toEqual(["a4"]);
  });

  it("returns a total only when every session purchase has a catalog cost", () => {
    const lines = [
      line({ id: "known", quantity: 2, unit_cost_cents: 399 }),
      line({ id: "unknown", quantity: 1.5, unit_cost_cents: null }),
    ];
    expect(summarizeStoreRun(lines, new Set(["known"]))).toMatchObject({
      purchasedCount: 1,
      stillNeededCount: 1,
      estimatedPurchasedTotalCents: 798,
    });
    expect(
      summarizeStoreRun(lines, new Set(["known", "unknown"]))
        .estimatedPurchasedTotalCents,
    ).toBeNull();
  });
});

describe("buildSeedLinesFromEstimate", () => {
  it("merges one 1007 kit with recomputed lines for a mixed estimate", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM estimate_line_items eli")) {
        return { rows: [{ code: "1007", category: "general_repairs", description: "1007 — Door hardware replacement" }] };
      }
      if (sql.includes("estimate_scope_snapshots")) {
        return { rows: [
          { category: "general_repairs", service_code: "1007", components: {}, complexity: {} },
          { category: "general_repairs", service_code: "1001", components: {}, complexity: {} },
        ] };
      }
      return {
        rows: [{
          id: "compound", price_book_id: null, category: "general_repairs",
          material_name: "Joint compound", description: null, quantity_type: "static",
          scope_component_key: null, quantity_multiplier: null, quantity_flat: 1,
          waste_factor: 1, unit: "gal", unit_cost_cents: 3000,
          store_section: "Paint", is_consumable: false, is_optional: false,
          condition_factor_key: null, sort_order: 0,
        }],
      };
    });

    const lines = await buildSeedLinesFromEstimate(
      { query } as never,
      { id: "estimate-1", status: "approved", shopping_list_json: null },
    );

    expect(lines.find((line) => line.name === "Joint compound")?.quantity).toBe(1);
    expect(lines.find((line) => line.name.includes("lockset"))?.quantity).toBe(1);
  });

  it("1007-only estimate seeds the hardware kit and excludes drywall mud/tape", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM estimate_line_items eli")) {
        return { rows: [{ code: "1007", category: "general_repairs", description: "1007 — Door hardware replacement" }] };
      }
      if (sql.includes("estimate_scope_snapshots")) {
        return { rows: [
          { category: "general_repairs", service_code: "1007", components: {}, complexity: {} },
        ] };
      }
      return {
        rows: [
          {
            id: "compound", price_book_id: null, category: "general_repairs",
            material_name: "Joint compound", description: null, quantity_type: "static",
            scope_component_key: null, quantity_multiplier: null, quantity_flat: 1,
            waste_factor: 1, unit: "gal", unit_cost_cents: 3000,
            store_section: "Paint", is_consumable: false, is_optional: false,
            condition_factor_key: null, sort_order: 0,
          },
          {
            id: "tape", price_book_id: null, category: "general_repairs",
            material_name: "Fiberglass mesh tape", description: null, quantity_type: "static",
            scope_component_key: null, quantity_multiplier: null, quantity_flat: 1,
            waste_factor: 1, unit: "roll", unit_cost_cents: 800,
            store_section: "Paint", is_consumable: false, is_optional: false,
            condition_factor_key: null, sort_order: 1,
          },
        ],
      };
    });

    const lines = await buildSeedLinesFromEstimate(
      { query } as never,
      { id: "estimate-1007", status: "approved", shopping_list_json: null },
    );

    expect(lines.some((line) => /compound|mesh tape|mud/i.test(line.name))).toBe(false);
    expect(lines.some((line) => line.name.toLowerCase().includes("lockset"))).toBe(true);
    expect(lines.every((line) => line.source === "kit")).toBe(true);
    // Category-wide service_materials must not be queried into the buy list
    // for a 1007-only snapshot — the skip happens before computeMaterials.
    expect(query).toHaveBeenCalled();
  });
});
