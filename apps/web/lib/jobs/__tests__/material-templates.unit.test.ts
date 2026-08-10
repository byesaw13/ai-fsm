import { describe, expect, it } from "vitest";
import {
  auditPriceBookRow,
  expandMaterialTemplates,
  expandTemplateQuantity,
  suggestedPackageCents,
  type MaterialTemplateRow,
} from "../material-templates";

const base = (overrides: Partial<MaterialTemplateRow> = {}): MaterialTemplateRow => ({
  id: "t1",
  price_book_id: "pb1",
  price_book_code: "4010",
  price_book_name: "Handrail",
  catalog_material_id: null,
  material_name: "Shims (pack)",
  quantity_type: "static",
  quantity_flat: 1,
  input_key: null,
  quantity_multiplier: null,
  waste_factor: 1,
  role: "must_buy",
  unit_label: "pack",
  store_section: "Lumber",
  sort_order: 0,
  ...overrides,
});

describe("expandTemplateQuantity", () => {
  it("expands static with waste", () => {
    expect(
      expandTemplateQuantity(
        { quantity_type: "static", quantity_flat: 2, input_key: null, quantity_multiplier: null, waste_factor: 1.1 },
        {},
      ),
    ).toBe(3);
  });

  it("skips per_input when dimension missing", () => {
    expect(
      expandTemplateQuantity(
        {
          quantity_type: "per_input",
          quantity_flat: null,
          input_key: "drywall_sqft",
          quantity_multiplier: 0.03125,
          waste_factor: 1.1,
        },
        {},
      ),
    ).toBeNull();
  });

  it("expands per_input sheets from sqft", () => {
    // 96 sqft * 0.03125 = 3 sheets; * 1.1 waste → ceil 4
    expect(
      expandTemplateQuantity(
        {
          quantity_type: "per_input",
          quantity_flat: null,
          input_key: "drywall_sqft",
          quantity_multiplier: 0.03125,
          waste_factor: 1.1,
        },
        { drywall_sqft: 96 },
      ),
    ).toBe(4);
  });
});

describe("expandMaterialTemplates", () => {
  it("defaults to must_buy only", () => {
    const lines = expandMaterialTemplates([
      base({ material_name: "Must", role: "must_buy" }),
      base({ id: "t2", material_name: "Optional glue", role: "optional" }),
      base({ id: "t3", material_name: "Screws", role: "consumable" }),
    ]);
    expect(lines.map((l) => l.name)).toEqual(["Must"]);
  });

  it("includes optional when requested and skips customer supplied", () => {
    const lines = expandMaterialTemplates(
      [
        base({ material_name: "Door slab", role: "must_buy" }),
        base({ id: "t2", material_name: "Caulk", role: "optional" }),
      ],
      { includeOptional: true, customerSuppliedNames: ["Door slab"] },
    );
    expect(lines.map((l) => l.name)).toEqual(["Caulk"]);
  });

  it("dedupes and sums quantities", () => {
    const lines = expandMaterialTemplates([
      base({ material_name: "Shims (pack)", quantity_flat: 1 }),
      base({ id: "t2", material_name: "Shims (pack)", quantity_flat: 2, price_book_code: "4005" }),
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(3);
  });
});

describe("pricing truth helpers", () => {
  it("suggests package from hours × bill rate", () => {
    expect(suggestedPackageCents(2, 11500)).toBe(23000);
  });

  it("flags missing labor and under-cost packages", () => {
    const missing = auditPriceBookRow(
      {
        id: "1",
        code: "4005",
        name: "Shelves",
        category: "carpentry",
        default_price_cents: 4500,
        labor_hours_typical: null,
        last_verified_at: null,
      },
      11500,
      5000,
    );
    expect(missing.missingLaborHours).toBe(true);

    const under = auditPriceBookRow(
      {
        id: "2",
        code: "4001",
        name: "Assembly",
        category: "carpentry",
        default_price_cents: 5000,
        labor_hours_typical: 2,
        last_verified_at: null,
      },
      11500,
      5000,
    );
    // cost floor = 2 * 50 = 10000 cents; price 5000 under cost
    expect(under.underCostFloor).toBe(true);
    expect(under.suggestedPackageCents).toBe(23000);
  });
});
