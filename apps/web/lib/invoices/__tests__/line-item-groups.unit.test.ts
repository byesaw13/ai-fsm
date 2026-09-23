import { describe, expect, it } from "vitest";
import { groupInvoiceLineItems, lineItemSectionKey, subgroupBySection } from "../line-item-groups";

const item = (
  line_item_type: string,
  total_cents: number,
  extra: { material_kind?: string | null; store_section?: string | null; sort_order?: number } = {},
) => ({ line_item_type, total_cents, ...extra });

describe("line-item-groups", () => {
  it("splits materials into Materials vs Equipment & rentals by material_kind", () => {
    expect(lineItemSectionKey(item("materials", 100, { material_kind: "material" }))).toBe("materials");
    expect(lineItemSectionKey(item("materials", 100, { material_kind: "equipment" }))).toBe("equipment");
    // Legacy/untagged materials fall under Materials.
    expect(lineItemSectionKey(item("materials", 100, { material_kind: null }))).toBe("materials");
    expect(lineItemSectionKey(item("labor", 100))).toBe("labor");
  });

  it("groups into fixed section order with per-section subtotals", () => {
    const groups = groupInvoiceLineItems([
      item("adjustment", -500, { sort_order: 9 }),
      item("materials", 3000, { material_kind: "equipment", sort_order: 4 }),
      item("labor", 10000, { sort_order: 0 }),
      item("materials", 1500, { material_kind: "material", sort_order: 2 }),
      item("materials", 500, { material_kind: null, sort_order: 3 }),
      item("handling_fee", 300, { sort_order: 5 }),
    ]);

    expect(groups.map((g) => g.key)).toEqual([
      "labor",
      "materials",
      "equipment",
      "handling_fee",
      "adjustment",
    ]);
    expect(groups.find((g) => g.key === "materials")?.subtotalCents).toBe(2000); // 1500 + 500
    expect(groups.find((g) => g.key === "equipment")?.subtotalCents).toBe(3000);
    expect(groups.find((g) => g.key === "equipment")?.label).toBe("Equipment & rentals");
  });

  it("omits empty sections and orders items within a section by sort_order", () => {
    const groups = groupInvoiceLineItems([
      item("materials", 200, { material_kind: "material", sort_order: 5 }),
      item("materials", 100, { material_kind: "material", sort_order: 1 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((i) => i.total_cents)).toEqual([100, 200]);
  });

  it("subgroupBySection: named sections alpha-sorted, Other (null) last, with subtotals", () => {
    const subs = subgroupBySection([
      item("materials", 300, { store_section: "Paint", sort_order: 3 }),
      item("materials", 100, { store_section: "Hardware", sort_order: 1 }),
      item("materials", 500, { store_section: null, sort_order: 4 }),
      item("materials", 200, { store_section: "Hardware", sort_order: 2 }),
    ]);
    expect(subs?.map((s) => s.label)).toEqual(["Hardware", "Paint", "Other"]);
    expect(subs?.find((s) => s.label === "Hardware")?.subtotalCents).toBe(300); // 100 + 200
    expect(subs?.find((s) => s.label === "Other")?.subtotalCents).toBe(500);
  });

  it("subgroupBySection: undefined when no line carries a section (flat list)", () => {
    expect(subgroupBySection([item("materials", 100), item("materials", 200)])).toBeUndefined();
  });

  it("materials group carries subgroups only when a section is present", () => {
    const withSection = groupInvoiceLineItems([
      item("materials", 100, { material_kind: "material", store_section: "Lumber" }),
    ]).find((g) => g.key === "materials");
    expect(withSection?.subgroups?.map((s) => s.label)).toEqual(["Lumber"]);

    const withoutSection = groupInvoiceLineItems([
      item("materials", 100, { material_kind: "material" }),
    ]).find((g) => g.key === "materials");
    expect(withoutSection?.subgroups).toBeUndefined();
  });
});
